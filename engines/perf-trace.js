/**
 * WorldAxis engines/perf-trace.js (v2.102.0) — 性能基线与分层增量（**纯内存观测**）
 *
 * 【为什么需要这一面】
 *   v2.88.0（O1）给注入链装了**成本账**：按源记 `{ms, n}`，答得出「这一轮慢在谁身上」。
 *   但那张账答不出另外三个问题：
 *     ① **「冷启一次要多久」**——账是按源横切的**本轮**读数，没有「第一次跑 vs case 已热」
 *        的分列。实测（本面开工时的只读探针）：`clockWall()` 两次相邻调用差 **0ms** ⇒
 *        本仓的墙体时钟只精到 1ms，任何单次测量都不可作结论 ⇒ 基线必须**聚合**（P50/P95）。
 *     ② **「变了的东西才重算」**——注入链每轮把 47 个源全部重建一遍。哪些源真的受影响
 *        此前无从判定，于是只有两种极端：全算，或不算。
 *     ③ **「慢在哪一类事上」**——本地计算 / 宿主 API / 序列化 / UI 渲染四类此前全混在
 *        一个 totalMs 里，UI 的渲染开销更是一个字都没记过。
 *
 * 【本面的四条口径（全是否定式）】
 *   ① **纯内存观测**：本模块**不写存档、不写 stat、不隐式写盘**。它记的每一次读数都只活在
 *      内存里（有界环形），「取证不得改变被取证对象」——实测：本模块全部出口跑完后
 *      `store.get()` 逐字节不变。**注意**：`stat`（进程计数）会变，那是懒初始化所致，
 *      判据必须钉**存档**而不是钉 stat（这是本面开工实测到的一条事实）。
 *   ② **脏集粒度在「层」，不在「源」**：A2 开工时用 Proxy 包 `WA.store.get` 实测了每个源
 *      读了哪些顶层键——空世界下 **38 个源全部早退、根本没碰 store**，只有 4 个源（记忆 /
 *      舆情 / 账本 / 摘要）读到了键。也就是说「源 → 依赖」这件事在代码里是**隐式**的，
 *      硬把它抽成一张声明表，就是**新造第二套真源**（红线）。故本模块只做**指纹 + 缓存**，
 *      值由调用方给（`mark(layer, key, value)` / `ensure(layer, produce, {stamp})`）：
 *      粒度定在层（注入 / 诊断 / 原著对位 / 世界状态视图），层内按调用方给的键去重。
 *   ③ **缓存失效宁可重算**：指纹读不出来（`na`）时**一律重算**，绝不拿旧值冒充命中；
 *      produce 抛错时如实报 `ok:false`，**不返回上一次的旧值**（那是「结论不实」的经典形态）。
 *   ④ **不注入正文、不落盘**：历史曲线只留**数字**（耗时序列），不留任何产物文本；
 *      窗口有界（`HISTORY_CAP`），挤出即 `dropped++`（同 `engines/org.js` 的环形账范式）。
 *
 * 【职责边界（为什么 ensure 不计时）】
 *   `ensure` 只管**指纹与缓存**，**不**计耗时——计时是调用方（`runFace` / `bench`）的事。
 *   理由是这里出过一次真错：两处都计一遍会把同一次调用算进两份账（`local` 桶虚高、
 *   层历史里出现两个样本），而那种失真在读数上完全看不出来（两边都"有数"）。
 *
 * 【本面开工后自纠的三处（都是「读数看着有数、其实没有意义」）】
 *   ① **「缺席」不能靠产物真假来判**：首版 `faceAvail` 写的是 `!!probe()`。实测抓到反例——
 *      空世界下 `buildWorldSnapshot()` 合法返回**空串**（全源关闭 ⇒ 快照为空，那是「本轮没东西」，
 *      不是「模块不在」）。于是一个正常读出的空结果被记成 `absent`，而 `absent` 的语义是
 *      「模块不在，这个面根本没跑」。真正该判的是**模块与出口在不在**（`ready()` 谓词），
 *      产物是不是空串与本面无关。
 *   ② **一致性不能拿带计时的行去比**：首版 `warmStart` 的复核是 `sameValue(v, again)`，
 *      而 `v` 是 `runFace` 的**行**（带 `ms` 字段）。两次调用的毫秒数几乎必然不同 ⇒
 *      `same` 恒假 ⇒ 这条判据**永远报「不一致」**（一个恒假的判据比没有判据更坏：它把
 *      「缓存坏了」与「这个面本来就不稳定」压成同一个读数）。修法：比的是**产物的指纹**
 *      （`fp` 不包含耗时），并在不一致时**再独立算一遍**分诊「缓存坏了」（stale）与
 *      「这个面本身不可复现」（volatile，如实报而不是赖到缓存头上）。
 *   ③ 分诊只在**有分歧时**才发起第二次独立计算（一致时零额外开销）。
 *
 * 【四类基准的诚实边界】
 *   `short` / `medium` / `long` 是同机可测的三档（靠重复次数与预算规模分档）；
 *   **`lowend`（低端移动设备）在同机上不可真测**——本面用「同机放大估计」表达，
  *   读数带 `approx:true` 并明说「真机读数须实机」。**不拿同机数字冒充真机读数**。
  *
  * 【增量必须有自己的生产者（本版补的一处硬缺口）】
  *   上一版把「增量」全押在调用方声明的脏集上（`mark(layer, key, value)` 是唯一生产者），
  *   而本仓**产品侧零调用点** ⇒ 热启复用率永远是 0、「增量计算」在产品里只是一句标语。
  *   本版把**世界步进序号**接成真生产者：`WA.store.get().meta.stateRev`
  *   （`core/store.js` 每次落盘 `stateRev = (__seenRev||0)+1`，随存档 persisted ⇒ 跨会话可读）。
  *   「这一轮世界推进了几步」库里本来就有答案，故本面**读到就用**，不去猜、不去声明；
  *   `partial()` 就是按它（加上各面自报的输入）决定**哪一面**要重算。指纹仍复用
  *   `timeline.hashText`（**不新造第二份真源**——两份实现迟早在边界字符上分叉）。
  *   已知边界（如实登记，不伪称周全）：`canonAlign` 的幕表住在**设置**侧、不在 `stateRev` 里，
  *   故单改幕表而世界没落盘时它不会被判脏 —— 要它重算须显式 `mark('canonAlign', …)` 或 `force`。
  *   输入读不出来（store 缺席 / 未落过盘 ⇒ 无 `stateRev` / 抛错）⇒ **一律重算**，不拿旧值冒充命中。
  */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** 本文件内拼多行输出的统一样式（避免脚本里混入真实换行）。 */
  const NL_S = String.fromCharCode(10);
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  /** 层封闭集合。顺序写死：面板与诊断按此序念出，不随装载顺序漂。 */
  const LAYERS = ['inject', 'diagnose', 'canonAlign', 'worldState'];
  const LAYER_LABEL = {
    inject: '注入面（逐源可见性 / 模块开关对账）',
    diagnose: '诊断面（全量采集包）',
    canonAlign: '原著对位（题名级对位计算）',
    worldState: '世界状态视图（六段快照合成）'
  };
  /** 耗时分列的四个桶。`host` / `render` 由外部上报（本面不替它们编数）。 */
  const SPANS = ['local', 'host', 'serialize', 'render'];
  /** 四类基准。`lowend` 是同机放大估计，读数带 approx。 */
  const CLASSES = ['short', 'medium', 'long', 'lowend'];
  const CLASS_DEF = {
    short: { repeats: 1, budget: 800, approx: false, note: '短文本（单轮、小预算）' },
    medium: { repeats: 3, budget: 2000, approx: false, note: '中等存档（三轮、中预算）' },
    long: { repeats: 6, budget: 4000, approx: false, note: '长存档（六轮、满预算）' },
    lowend: { repeats: 3, budget: 2000, approx: true, note: '低端移动设备（同机放大估计，真机读数须实机）' }
  };
  /** 有限窗口历史曲线：只留数字，留够看 P50/P95 与峰值，不留产物、不落盘。 */
  const HISTORY_CAP = 64;
  /** 每层指纹键上限（有界；挤出即 evicted++，不静默丢）。 */
  const FINGERPRINT_CAP = 256;
  /**
   * v2.109.0（#9）：每层**缓存槽**上限。此前 `_cache` **无上限** ——
   *   指纹表有界（FINGERPRINT_CAP 挤出即计数），缓存表却随会话里出现过的
   *   每一个 `layer:key` 组合线性增长，而它一个计数都没有（`slots()` 只报当前在场项）。
   *   「有界的地方被数着、没界的地方没人看」是本仓反复出现的形态（见 004 号形态）。
   */
  const CACHE_CAP = 64;
  /** 淘汰策略（#9）。`fifo` = 插入序最早先走（既有行为）；`lru` = 最久未访问先走。 */
  const EVICT_POLICIES = ['fifo', 'lru'];
  /** 火焰图帧数上限（#11，有界；挤出即 dropped++）。 */
  const FLAME_CAP = 256;
  /**
   * 劣化告警阈值（#10）。**相对**读数（倍数），跨机可比——
   *   绝对毫秒数跨机器不可比（本仓实测同一次全量回归在不同机器上差 3 倍以上），
   *   拿绝对值当阈值就是「换台机器就假红」。故阈值只认比例：`factor`（倍数）
   *   与 `minSamples`（样本下限，样本不够不判——防「第一个样本」抖动成告警）。
   *   `minMs` 同理是**放大后的**门槛：小于它的差是噪声（本仓墙体时钟只精到 1ms）。
   */
  const PERF_THRESHOLD = { factor: 1.5, minSamples: 8, minMs: 4 };

  const _marks = {};      // layer -> { key -> fp }
  const _dirty = {};      // layer -> { key -> true }（自上次 consume 以来变过的键）
  const _cache = {};      // layer -> { key -> { fp, vfp, infp, value, at, lastAccessAt, hits, stale } }
  const _samples = {};    // layer -> { n, sum, min, max, lastMs, lastAt, dropped, ring:[] }
  const _faceMs = {};     // layer -> { face -> { n, ms } }（#11 火焰图的唯一依据）
  const _fpIndex = {};    // 输入指纹 -> { 产物指纹 -> n }（#8 冲突检测的唯一依据）
  let _cachePolicy = 'fifo';   // #9：默认保持既有行为（lru 由调用方显式选择）
  const _span = {
    local: { ms: 0, n: 0, declared: true },
    host: { ms: 0, n: 0, declared: false },
    serialize: { ms: 0, n: 0, declared: true },
    render: { ms: 0, n: 0, declared: false }
  };
  const _stat = { calls: 0, marks: 0, reuse: 0, recompute: 0, miss: 0, evicted: 0, forced: 0, dirtyHit: 0,
    partialCalls: 0, partialReused: 0, lastAt: 0, lastErr: '',
    fpCollisions: 0, evictedPolicy: 0, flameDropped: 0, alertCount: 0, lastAlert: '' };

  function clean(v, max) {
    try { return WA.inputGuard && WA.inputGuard.text ? WA.inputGuard.text(v, max || 80) : String(v === null || v === undefined ? '' : v).slice(0, max || 80); }
    catch (e) { return String(v === null || v === undefined ? '' : v).slice(0, max || 80); }
  }
  function inLayers(L) { return LAYERS.indexOf(L) >= 0; }

  /**
   * 指纹：**复用** `timeline.hashText`（FNV-1a 双哈希，本仓唯一指纹实现）。
   *   为什么不自己写一遍：指纹函数是「同一份输入必须给同一份输出」的承诺，
   *   两处实现迟早在边界字符上分叉（而那会让脏集判成「没变」⇒ 拿旧值当新值）。
   *   `typeof v === 'string'` 时直接哈希原文（省一次序列化）；否则序列化后哈希。
   *   返回 `'na'` 表示**指纹不可读** ⇒ 调用方必须按「判不清」处理（一律重算）。
   */
  function fingerprint(value) {
    try {
      const s = (typeof value === 'string') ? value : JSON.stringify(value === undefined ? null : value);
      if (typeof s !== 'string') return 'na';
      if (!WA.timeline || typeof WA.timeline.hashText !== 'function') return 'na';
      const f = WA.timeline.hashText(s);
      return (typeof f === 'string' && f) ? f : 'na';
    } catch (e) { return 'na'; }
  }
  /** 逐字段比较两份值（同 `JSON.stringify` 口径；不可序列化 ⇒ 如实报 false，不猜相等）。 */
  function sameValue(a, b) {
    try { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
    catch (e) { return false; }
  }
  /** 序列化字节数（只报**规模**，不留正文——「不注入正文」）。耗时单独计进 serialize 桶。 */
  function sizeOf(value) {
    const t0 = clockWall();
    let n = 0;
    try { n = JSON.stringify(value === undefined ? null : value).length; } catch (e) { n = -1; }
    note('serialize', clockWall() - t0);
    return n;
  }
  function note(span, ms) {
    const b = _span[span];
    if (!b) return;
    b.n++;
    b.ms = Math.round((b.ms + ((typeof ms === 'number' && isFinite(ms) && ms > 0) ? ms : 0)) * 100) / 100;
    if (span === 'host' || span === 'render') b.declared = true;
  }

  /* ── 分层指纹与脏集（粒度在层；值由调用方给） ───────────────────────── */

  /**
   * 标记一个（层, 键）的当前值指纹。返回 `changed`——**首次登记也算变过**
   *   （「还没算过」与「算过且一样」是两件事：前者必须算，后者可以复用）。
   * 已登记过的键再次登记时对象属性位置不变（不删不重插）⇒ 不会把自己挤出队尾。
   */
  function mark(layer, key, value) {
    const L = clean(layer, 24), K = clean(key, 40);
    if (!L || !K || !inLayers(L)) return { layer: L, key: K, fp: 'na', changed: true, first: true, ok: false, reason: 'bad-layer-or-key' };
    const f = fingerprint(value);
    const slot = _marks[L] || (_marks[L] = {});
    const had = Object.prototype.hasOwnProperty.call(slot, K);
    const changed = !had || (slot[K] !== f);
    slot[K] = f;
    // 有界：挤出最旧登记的键（对象枚举序即插入序；只在新键上才有挤出的可能）
    const ks = Object.keys(slot);
    if (ks.length > FINGERPRINT_CAP) { delete slot[ks[0]]; _stat.evicted++; }
    _stat.marks++;
    if (changed) (_dirty[L] || (_dirty[L] = {}))[K] = true;
    return { layer: L, key: K, fp: f, changed: changed, first: !had, ok: true };
  }
  /** 该层自上次 consume 以来变过的键（升序，稳定序）。 */
  function dirtyOf(layer) { return Object.keys(_dirty[clean(layer, 24)] || {}).sort(); }
  /** 全层的脏键汇总（诊断念这个）。 */
  function dirtyAll() {
    const out = {};
    LAYERS.forEach(function (L) { out[L] = dirtyOf(L); });
    return out;
  }
  /** 消费脏集（清空该层的变更标记），返回被清掉的键。 */
  function consume(layer) {
    const L = clean(layer, 24);
    const ks = dirtyOf(L);
    delete _dirty[L];
    return ks;
  }

  /**
   * 指纹缓存：命中复用 / 脏或失效重算。**不计时**（见文件头「职责边界」）。
   *   命中条件（两条路，任一成立即可）：
   *     · `o.dirty` 模式：该层**没有脏键**（调用方用 `mark` 声明输入指纹）；
   *     · `o.stamp` 模式：提供的指纹可读且与槽位记录相同。
   *   反向条件：`force` 一律不命中（冷启动问的就是「第一次要多久」）。
   *   指纹不可读（`na`）/ 没有任何指纹来源 ⇒ **一律重算**（宁可多算，不拿旧值冒充命中）。
   *   produce 抛错 ⇒ 返回 `ok:false` 且**不写缓存**（旧值连坐都不许，
   *   否则「这次算失败」会以下一次命中的样子把上次的结果发出去）。
   */
  function ensure(layer, key, produce, opts) {
    const o = opts || {};
    const L = clean(layer, 24), K = clean(key, 40);
    const slot = _cache[L] || (_cache[L] = {});
    const cur = slot[K];
    let f = null, okStamp = false;
    if (o.dirty) { const d = dirtyOf(L).length; okStamp = (d === 0); f = okStamp ? 'clean' : 'dirty-' + d; }
    else if (o.rev !== undefined) { f = fingerprint(o.rev); okStamp = (f !== 'na'); }
    else if (o.stamp !== undefined) { f = fingerprint(o.stamp); okStamp = (f !== 'na'); }
    _stat.calls++;
    if (cur && !o.force && okStamp && cur.fp === f) {
      // v2.109.0（#8）：指纹只是**承诺**（同一份输入给同一份输出）。承诺可能破——
      //   破了的后果是「拿旧值当新值」，而读数上完全看不出来（两边都"有值"）。
      //   故调用方若给了**完整输入**（`o.full`），除指纹相等外还要真比一遍输入本身：
      //   指纹相等而完整输入不等 ⇒ **指纹冲突** ⇒ 一律重算，不拿旧值冒充命中。
      let conflict = false;
      if (o.full !== undefined) {
        const finfp = fingerprint(o.full);
        if (finfp !== 'na' && cur.infp && cur.infp !== 'na' && cur.infp !== finfp) {
          conflict = true; _stat.fpCollisions++;
        }
      }
      if (!conflict) {
        cur.hits++; cur.lastAccessAt = clockWall(); _stat.reuse++;
        if (o.dirty) _stat.dirtyHit++;
        return { layer: L, key: K, ok: true, hit: true, recomputed: false, value: cur.value, fp: f, vfp: cur.vfp || '', reason: 'reuse' };
      }
      _stat.lastErr = clean('fingerprint-collision:' + K, 120);
    }
    if (o.force) _stat.forced++;
    let v, err = '';
    try { v = (typeof produce === 'function') ? produce() : produce; }
    catch (e) { err = String((e && e.message) || e); }
    if (err) {
      _stat.miss++; _stat.lastErr = clean(err, 120);
      if (cur) cur.stale = (cur.stale || 0) + 1;
      return { layer: L, key: K, ok: false, hit: false, recomputed: true, error: err, fp: f, vfp: '', reason: 'produce-failed' };
    }
    const vfp = fingerprint(v);
    const infp = (o.full !== undefined) ? fingerprint(o.full) : '';
    noteFpIndex(f, vfp);
    const nowAt = clockWall();
    slot[K] = { fp: f, vfp: vfp, infp: infp, value: v, at: nowAt, lastAccessAt: nowAt, hits: 0, stale: (cur ? (cur.stale || 0) : 0) };
    _enforceCap(L, slot);
    _stat.recompute++;
    return { layer: L, key: K, ok: true, hit: false, recomputed: true, value: v, fp: f, vfp: vfp, reason: o.force ? 'forced' : 'stale' };
  }
  /**
   * v2.109.0（#8）：把「输入指纹 → 产物指纹」记成可查索引。
   *   同一份输入指纹映射出**第二个**不同产物指纹 ⇒ 承诺破了（`fpCollisions++`）。
   *   过滤掉非指纹形态（`na` / `clean` / `dirty-N` 是状态标记，不是指纹）。
   */
  function noteFpIndex(fp, vfp) {
    if (!fp || fp === 'na' || !vfp || vfp === 'na') return false;
    if (fp === 'clean' || fp.indexOf('dirty-') === 0) return false;
    const m = _fpIndex[fp] || (_fpIndex[fp] = {});
    const had = Object.keys(m);
    m[vfp] = (m[vfp] || 0) + 1;
    // 索引自身有界（与指纹表同口径：挤出最旧登记的输入指纹，不静默无界增长）
    const ks = Object.keys(_fpIndex);
    if (ks.length > FINGERPRINT_CAP) delete _fpIndex[ks[0]];
    if (had.length && had.indexOf(vfp) < 0) { _stat.fpCollisions++; return true; }
    return false;
  }
  /** v2.109.0（#9）：缓存槽超上限即淘汰（策略见 `setCachePolicy`），挤出即计数。 */
  function _enforceCap(L, slot) {
    const ks = Object.keys(slot);
    if (ks.length <= CACHE_CAP) return;
    let victim = ks[0];
    if (_cachePolicy === 'lru') {
      ks.forEach(function (k) {
        const a = slot[k].lastAccessAt || slot[k].at || 0;
        const b = slot[victim].lastAccessAt || slot[victim].at || 0;
        if (a < b) victim = k;
      });
    }
    delete slot[victim];
    _stat.evicted++; _stat.evictedPolicy++;
  }
  /**
   * v2.109.0（#9）：换淘汰策略。默认 `fifo` 保持既有行为——
   *   lru 需要每次命中都写 `lastAccessAt`（内存里的隐式状态写），
   *   换默认前得先把「观测不得改变被观测对象」的口径复核一遍，故由调用方显式选择。
   */
  function setCachePolicy(p) {
    const x = clean(p, 8);
    if (EVICT_POLICIES.indexOf(x) < 0) return { ok: false, reason: 'unknown-policy', known: EVICT_POLICIES.slice(), policy: _cachePolicy };
    _cachePolicy = x;
    return { ok: true, policy: _cachePolicy };
  }
  /** v2.109.0（#9）：缓存槽的**热度**读数（含最近访问时刻与年龄）。 */
  function slots(layer) {
    const L = clean(layer, 24);
    const s = _cache[L] || {};
    const now = clockWall();
    return Object.keys(s).sort().map(function (k) {
      const at = s[k].lastAccessAt || s[k].at || 0;
      return { key: k, fingerprint: s[k].fp, fp: s[k].fp, vfp: s[k].vfp, hits: s[k].hits, stale: s[k].stale || 0,
        at: s[k].at, lastAccessAt: at, ageMs: at ? Math.max(0, now - at) : 0 };
    });
  }
  /** v2.109.0（#9）：缓存面读数（策略 / 上限 / 逐层占用 / 挤出）。 */
  function cacheStat() {
    const per = {}; let total = 0;
    LAYERS.forEach(function (L) { const n = Object.keys(_cache[L] || {}).length; per[L] = n; total += n; });
    return { policy: _cachePolicy, policies: EVICT_POLICIES.slice(), cap: CACHE_CAP,
      total: total, per: per, evicted: _stat.evicted, evictedPolicy: _stat.evictedPolicy };
  }
  /** v2.109.0（#9）：热度直方图（按 ageMs 分桶；纯读，不改任何槽）。 */
  function heatHistogram(layer) {
    const buckets = [{ label: '<1s', max: 1000 }, { label: '<1min', max: 60000 },
      { label: '<10min', max: 600000 }, { label: '≥10min', max: Infinity }];
    const rows = slots(layer);
    const out = buckets.map(function (b) { return { label: b.label, n: 0 }; });
    rows.forEach(function (r) {
      for (let i = 0; i < buckets.length; i++) { if (r.ageMs < buckets[i].max) { out[i].n++; break; } }
    });
    return { layer: clean(layer, 24), total: rows.length, buckets: out, policy: _cachePolicy };
  }

  /* ── 分层计时与有限窗口历史曲线 ───────────────────────────────────── */

  function record(layer, ms) {
    const L = clean(layer, 24);
    if (!inLayers(L)) return null;
    const s = _samples[L] || (_samples[L] = { n: 0, sum: 0, min: null, max: 0, lastMs: 0, lastAt: 0, dropped: 0, ring: [] });
    const x = (typeof ms === 'number' && isFinite(ms) && ms > 0) ? ms : 0;
    s.n++; s.sum = Math.round((s.sum + x) * 100) / 100;
    s.min = (s.min === null) ? x : Math.min(s.min, x);
    s.max = Math.max(s.max, x);
    s.lastMs = x; s.lastAt = clockWall();
    s.ring.push(x);
    if (s.ring.length > HISTORY_CAP) { s.ring.shift(); s.dropped++; }
    return s;
  }
  function pct(sorted, p) {
    if (!sorted.length) return 0;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[i];
  }
  /**
   * 基线读数：**P50 / P95 + 峰值**，不是「平均」。
   *   理由（本面开工实测）：本仓墙体时钟只精到 1ms，单次读数常量到 0，
   *   平均值会把「低于精度」与「真很快」混成一档；分位数配 `subTick` 计数才分得开。
   */
  function baseline(layer) {
    const L = clean(layer, 24);
    const s = _samples[L];
    if (!s || !s.ring.length) return { layer: L, n: 0, window: 0, cap: HISTORY_CAP, p50: 0, p95: 0, min: 0, max: 0, subTick: 0, dropped: 0, series: [] };
    const sorted = s.ring.slice().sort(function (a, b) { return a - b; });
    return { layer: L, n: s.n, window: s.ring.length, cap: HISTORY_CAP, p50: pct(sorted, 50), p95: pct(sorted, 95),
      min: s.min || 0, max: s.max, subTick: s.ring.filter(function (x) { return x === 0; }).length,
      dropped: s.dropped, lastMs: s.lastMs, lastAt: s.lastAt, series: s.ring.slice() };
  }
  /** 历史曲线（有限窗口；**只留数字**，无产物正文、不写世界存档）。 */
  function curve(layer) {
    const b = baseline(layer);
    return { layer: b.layer, n: b.n, window: b.window, cap: HISTORY_CAP, dropped: b.dropped,
      p50: b.p50, p95: b.p95, min: b.min, max: b.max, subTick: b.subTick, series: b.series };
  }
  function curveAll() { const out = {}; LAYERS.forEach(function (L) { out[L] = curve(L); }); return out; }

  /** 四种耗时分列（本面自己能量的是 local / serialize；host / render 由外部上报，未上报即 declared:false）。 */
  function noteSpan(span, ms) {
    const S = clean(span, 16);
    if (SPANS.indexOf(S) < 0) return { ok: false, reason: 'unknown-span', known: SPANS.slice() };
    note(S, ms);
    return { ok: true, span: S };
  }
  function split() {
    const out = { localMs: _span.local.ms, hostMs: _span.host.ms, serializeMs: _span.serialize.ms, renderMs: _span.render.ms,
      samples: { local: _span.local.n, host: _span.host.n, serialize: _span.serialize.n, render: _span.render.n },
      declared: { local: true, host: _span.host.declared, serialize: true, render: _span.render.declared } };
    out.total = Math.round((out.localMs + out.hostMs + out.serializeMs + out.renderMs) * 100) / 100;
    out.undeclared = SPANS.filter(function (s) { return !out.declared[s]; });
    out.note = out.undeclared.map(function (s) {
      if (s === 'host') return '宿主 API 耗时无上报（本面无宿主调用面）';
      if (s === 'render') return 'UI 渲染耗时无上报（ui/panel.js 在无头回归里不装载）';
      return s + ' 无上报';
    }).join('；');
    return out;
  }
  /** v2.109.0（#11）：面级耗时账（火焰图的**唯一**依据；此前只有层级账）。 */
  function faceNote(layer, face, ms) {
    const L = clean(layer, 24), F = clean(face, 40);
    if (!inLayers(L) || !F) return null;
    const m = _faceMs[L] || (_faceMs[L] = {});
    const r = m[F] || (m[F] = { n: 0, ms: 0 });
    r.n++;
    r.ms = Math.round((r.ms + ((typeof ms === 'number' && isFinite(ms) && ms > 0) ? ms : 0)) * 100) / 100;
    return r;
  }

  /* ── v2.109.0 #7：真机性能基线持续追踪（导出 / 导入比对） ────────────── */

  /**
   * 导出当前性能基线为**可落盘对象**（#7）。
   *   为什么需要它：`baseline()` 只活在内存里，会话一关就没了——
   *   于是「这个版本比上个版本慢了吗」在任何时刻都只能靠**记忆**回答。
   *   本出口把基线写成一份纯 JSON（`performance-snapshot-<ts>.json` 的**内容**，本面不落盘），
   *   下一版读到它就能逐层比对。
   * 口径（诚实边界）：**墙钟读数跨机器不可比**（同一次全量回归在不同机器上差 3 倍以上），
   *   故快照里同时带 `bytes`（产物规模，**确定量**，跨机可比）与 `ms`（墙钟，只在同机自比时有意义）
   *   两套读数，并各自标 `comparable` 标志——不把不可比的东西混成一个数。
   */
  function snapshot(label) {
    const at = clockWall();
    const layers = {};
    LAYERS.forEach(function (L) {
      const b = baseline(L);
      const fm = _faceMs[L] || {};
      layers[L] = { label: LAYER_LABEL[L] || '', n: b.n, window: b.window,
        p50: b.p50, p95: b.p95, max: b.max, subTick: b.subTick, dropped: b.dropped,
        faces: Object.keys(fm).sort().map(function (k) { return { face: k, n: fm[k].n, ms: fm[k].ms }; }) };
    });
    return { v: 1, at: at, label: clean(label, 60) || 'snapshot', version: (WA.VERSION || ''),
      historyCap: HISTORY_CAP, fingerprintCap: FINGERPRINT_CAP, cacheCap: CACHE_CAP,
      faces: FACE_KEYS.slice(), classes: CLASSES.slice(),
      layers: layers, split: split(), cache: cacheStat(), stat: stat(),
      comparable: { ms: false, bytes: true },
      note: '墙钟 ms 跨机不可比（同机自比可用）；bytes/计数为确定量，跨机可比' };
  }
  /**
   * 导入一份快照并与现场比对（#7）。返回逐层 delta 与判定。
   *   判定只用**同机可比**的那一半：`p95` 只在 `sameHost`（调用方声明同机）时判，
   *   否则只报**结构面**（层数 / 面数 / 缓存上限 / 策略）差异——那是跨机也能判的。
   *   `ok`（问题数）为 0 才是「与基线一致」；结构面缺项如实报 `missing` 而不是静默跳过。
   */
  function importSnapshot(obj, opts) {
    const o = opts || {};
    const problems = [];
    if (!obj || typeof obj !== 'object') return { ok: false, problems: ['not-an-object'], rows: [] };
    if (obj.v !== 1) problems.push('unknown-snapshot-version:' + String(obj.v));
    const rows = [];
    LAYERS.forEach(function (L) {
      const then = (obj.layers || {})[L];
      const now = baseline(L);
      if (!then) { problems.push('layer-missing:' + L); rows.push({ layer: L, then: null, now: { p50: now.p50, p95: now.p95, max: now.max }, verdict: 'missing' }); return; }
      const d95 = (typeof then.p95 === 'number' && then.p95 > 0) ? (now.p95 / then.p95) : 0;
      // 非同一台机 ⇒ 墙钟**不许**判，verdict 必须如实写成 `not-comparable`。
      //   首版留在 `'ok'` 上，而 `'ok'` 的语义是「判过了，没问题」——「没判」与「判过没问题」
      //   被压成同一个读数，正是本仓反复治的「结论不实」（由专锁 B2 当场抓出）。
      const row = { layer: L, then: { p50: then.p50, p95: then.p95, max: then.max },
        now: { p50: now.p50, p95: now.p95, max: now.max },
        ratio: d95 ? Math.round(d95 * 1000) / 1000 : 0, msComparable: !!o.sameHost,
        verdict: o.sameHost ? 'ok' : 'not-comparable' };
      if (o.sameHost && typeof then.p95 === 'number' && then.p95 > 0) {
        if (d95 >= PERF_THRESHOLD.factor && (now.p95 - then.p95) >= PERF_THRESHOLD.minMs) { row.verdict = 'regressed'; problems.push('regressed:' + L + ':' + row.ratio + 'x'); }
        else if (d95 <= 1 / PERF_THRESHOLD.factor) row.verdict = 'improved';
      }
      rows.push(row);
    });
    const struct = [];
    if (obj.cacheCap !== CACHE_CAP) struct.push('cacheCap ' + obj.cacheCap + ' -> ' + CACHE_CAP);
    if ((obj.faces || []).length !== FACE_KEYS.length) struct.push('faces ' + (obj.faces || []).length + ' -> ' + FACE_KEYS.length);
    return { ok: problems.length === 0, problems: problems, rows: rows, struct: struct,
      label: clean(obj.label, 60), at: obj.at || 0, msComparable: !!o.sameHost,
      note: o.sameHost ? '同机比对（含墙钟判定）' : '跨机比对：墙钟不可比，只判结构面（传 {sameHost:true} 才判墙钟）' };
  }

  /* ── v2.109.0 #10：劣化告警阈值 ─────────────────────────────────────── */

  /** 阈值读数（#10，纯读）。 */
  function thresholds() { return { factor: PERF_THRESHOLD.factor, minSamples: PERF_THRESHOLD.minSamples, minMs: PERF_THRESHOLD.minMs }; }
  /** 设置阈值（有界：factor 必须 > 1，否则「劣化」与「改进」不可分辨）。 */
  function setThresholds(o) {
    const x = o || {};
    const f = Number(x.factor);
    if (!(isFinite(f) && f > 1)) return { ok: false, reason: 'bad-factor', got: x.factor, thresholds: thresholds() };
    PERF_THRESHOLD.factor = f;
    if (isFinite(Number(x.minSamples)) && Number(x.minSamples) >= 1) PERF_THRESHOLD.minSamples = Math.floor(Number(x.minSamples));
    if (isFinite(Number(x.minMs)) && Number(x.minMs) >= 0) PERF_THRESHOLD.minMs = Number(x.minMs);
    return { ok: true, thresholds: thresholds() };
  }
  /**
   * 窗口内自比（#10）：`p95 / p50` 的倍数。
   *   为什么自比是有意义的：它衡量「这一层稳不稳」——p95 远高于 p50 说明偶发长尾，
   *   而那正是用户感知到的「卡」。样本不足（< minSamples）**不判**，如实报 `insufficient`。
   *   `minMs` 门槛：p95 与 p50 都小于它时差值属噪声（时钟只精到 1ms），不判。
   */
  function spikeOf(layer) {
    const b = baseline(layer);
    if (b.window < PERF_THRESHOLD.minSamples) return { layer: b.layer, ok: false, kind: 'insufficient', window: b.window, need: PERF_THRESHOLD.minSamples, ratio: 0, spiking: false };
    const ratio = b.p50 > 0 ? Math.round((b.p95 / b.p50) * 1000) / 1000 : 0;
    const spiking = ratio >= PERF_THRESHOLD.factor && (b.p95 - b.p50) >= PERF_THRESHOLD.minMs;
    return { layer: b.layer, ok: true, kind: spiking ? 'spike' : 'stable', window: b.window, p50: b.p50, p95: b.p95, ratio: ratio, spiking: spiking };
  }
  /**
   * 劣化告警（#10）：逐层判「长尾劣化」。
   *   传 `base`（一份快照）时另判**跨版本**劣化（且只在 `o.sameHost` 时判墙钟，见 `importSnapshot`）。
   *   告警一律 `WA.log('warn', …)` 发出去（**不能只返回数组**——没人读的告警等于没有告警），
   *   并累计 `alertCount` / `lastAlert` 供诊断念。
   */
  function alerts(base, opts) {
    const o = opts || {};
    const out = [];
    LAYERS.forEach(function (L) {
      const s = spikeOf(L);
      if (s.spiking) out.push({ layer: L, kind: 'spike', detail: 'P95 ' + s.p95 + 'ms / P50 ' + s.p50 + 'ms（' + s.ratio + 'x ≥ ' + PERF_THRESHOLD.factor + 'x，窗口 ' + s.window + '）' });
    });
    if (base) {
      const imp = importSnapshot(base, { sameHost: !!o.sameHost });
      imp.rows.forEach(function (r) { if (r.verdict === 'regressed') out.push({ layer: r.layer, kind: 'regressed', detail: '跨版本 P95 ' + r.ratio + 'x（' + r.then.p95 + ' -> ' + r.now.p95 + 'ms）' }); });
    }
    if (out.length) {
      _stat.alertCount += out.length;
      _stat.lastAlert = clean(out[0].layer + '/' + out[0].kind, 120);
      try { if (WA.log) WA.log('warn', '性能劣化告警：' + out.map(function (x) { return x.layer + '/' + x.kind; }).join(', ')); } catch (e) { /* 日志不可用不影响判据 */ }
    }
    return { at: clockWall(), alerts: out, n: out.length, thresholds: thresholds(), grade: out.length ? 'warn' : 'pass' };
  }

  /* ── v2.109.0 #11：火焰图（折叠栈 / JSON 树 / SVG） ─────────────────── */

  /**
   * 火焰图（#11）。三种形态：
   *   `folded` —— Brendan Gregg 折叠栈 `a;b;c <值>`（本面**值单位是毫秒**，非标准微秒，已标注）；
   *   `json`   —— `{name, value, children[]}` 树；
   *   `svg`    —— 零依赖拼出的矩形图（不引任何渲染库）。
   * **诚实边界（必须说清）**：本仓的「栈」**不是真调用栈**，而是「层 → 面」的分解
   *   （真调用栈只有 V8 profiler 能给，无头回归里不可用）。故读数是**逻辑火焰图**，
   *   带 `logical:true` 与一句明说，**不冒充**真调用栈火焰图。
   */
  function flameFrames() {
    const frames = [];
    LAYERS.forEach(function (L) {
      const s = _samples[L];
      const fm = _faceMs[L] || {};
      const keys = Object.keys(fm).sort();
      const faceSum = keys.reduce(function (a, k) { return a + (fm[k].ms || 0); }, 0);
      const total = faceSum || (s ? s.sum : 0);
      if (!total && !(s && s.n)) return;
      frames.push({ stack: 'perf;' + L, ms: Math.round(total * 100) / 100, n: (s ? s.n : 0) });
      keys.forEach(function (k) {
        frames.push({ stack: 'perf;' + L + ';' + L + '.' + k, ms: fm[k].ms, n: fm[k].n, face: k });
      });
    });
    if (frames.length > FLAME_CAP) { const d = frames.length - FLAME_CAP; frames.length = FLAME_CAP; _stat.flameDropped += d; }
    return frames;
  }
  function flamegraph(opts) {
    const o = opts || {};
    const fmt = clean(o.format, 12) || 'folded';
    const frames = flameFrames();
    if (fmt === 'folded') {
      const text = frames.map(function (f) { return f.stack + ' ' + f.ms; }).join(NL_S);
      return { ok: true, format: 'folded', unit: 'ms', logical: true, frames: frames.length, text: text,
        note: '逻辑火焰图（层/面分解，非真调用栈）；值单位为毫秒' };
    }
    if (fmt === 'json') {
      const tree = { name: 'perf', value: 0, children: [] };
      const byLayer = {};
      frames.forEach(function (f) {
        if (f.stack.split(';').length === 2) { const nd = { name: f.stack, value: f.ms, children: [] }; tree.children.push(nd); byLayer[f.stack] = nd; tree.value += f.ms; }
      });
      frames.forEach(function (f) {
        const parts = f.stack.split(';');
        if (parts.length !== 3) return;
        const p = byLayer['perf;' + parts[1]];
        if (p) p.children.push({ name: parts[2], value: f.ms, children: [] });
      });
      return { ok: true, format: 'json', logical: true, tree: tree, frames: frames.length };
    }
    if (fmt === 'svg') {
      const W = 900, ROW = 22, PAD = 4;
      const total = frames.filter(function (f) { return f.stack.split(';').length === 2; }).reduce(function (a, f) { return a + f.ms; }, 0) || 1;
      const rows = [];
      rows.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + (frames.length * ROW + ROW) + '">');
      let y = 0;
      frames.forEach(function (f) {
        const w = Math.max(2, Math.round((f.ms / total) * (W - 2 * PAD)));
        const depth = f.stack.split(';').length - 1;
        const x = PAD + (depth > 1 ? 24 : 0);
        const color = depth === 1 ? '#c94f4f' : '#e08a3c';
        rows.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (ROW - 2) + '" fill="' + color + '"/>');
        rows.push('<text x="' + (x + 4) + '" y="' + (y + 14) + '" font-size="11" fill="#fff">' + f.stack.replace(/[<>&]/g, '') + ' ' + f.ms + 'ms</text>');
        y += ROW;
      });
      rows.push('</svg>');
      return { ok: true, format: 'svg', logical: true, frames: frames.length, svg: rows.join(NL_S) };
    }
    return { ok: false, reason: 'unknown-format', known: ['folded', 'json', 'svg'] };
  }

  /* ── 四个观测面（全部委托既有真源，本面不另探一遍） ─────────────────── */

  /**
   * 面 → 既有真源。**每个面只有一个真源**，本面只负责**计时与指纹**：
   *   inject    → `render.visibilityStat()`（含 47 源 faceAudit 的逐源开关对账）
   *   diagnose  → `toolDiag.collect()`（全量采集包）
   *   canonAlign→ `canon.alignView()`（题名级对位计算）
   *   worldState→ `render.buildWorldSnapshot()`（六段快照合成）
   * 为什么这四个：它们正好是 A2 规格点名的四个面，且**都是纯读 / 纯计算**（零落盘）。
   * 模块缺席一律如实报 `absent`，**不假装跑过**（也不替它编一份 0ms 当成「很快」）。
   */
  /**
   * 世界步进序号（**本面的真生产者**，不是本面新造的）：`core/store.js` 每次落盘
   *   `s.meta.stateRev = (__seenRev || 0) + 1`，且它随存档 persisted ⇒ 跨会话可读。
   * 「这一轮世界推进了几步」在库里本来就有答案，故本面**读到就用**，不去猜、不去声明。
   * 未落过盘（内存态、无 `stateRev`）与读失败**可分辨**：前者 `unversioned`、后者 `read-failed`；
   *   两者都 `ok:false` ⇒ 调用方一律重算（宁可多算，不拿旧值冒充命中）。
   * 指纹取整个 `{rev, seq, at}` 而不只 `rev`：`writeSeq`（本实例写入序号）能让「同一 rev
   *   但两次落盘」也分辨得出来——只取 rev 会在那处把「变过」判成「没变」。
   */
  function worldRev() {
    try {
      const s = WA.store && typeof WA.store.get === 'function' ? WA.store.get() : null;
      const m = s && s.meta;
      if (!m) return { ok: false, kind: 'store-absent', rev: 0, seq: 0, at: 0, value: null };
      if (typeof m.stateRev !== 'number') return { ok: false, kind: 'unversioned', rev: 0, seq: 0, at: 0, value: null };
      const value = { rev: m.stateRev, seq: (typeof m.writeSeq === 'number' ? m.writeSeq : 0), at: (typeof m.updatedAt === 'number' ? m.updatedAt : 0) };
      return { ok: true, kind: 'world-step', rev: m.stateRev, seq: value.seq, at: value.at, value: value };
    } catch (e) { return { ok: false, kind: 'read-failed', rev: 0, seq: 0, at: 0, value: null }; }
  }
  /** 读一个面自报的输入；**抛错一律当「读不出来」**（⇒ 重算），不静默当成「没变」。 */
  function inputOf(d) {
    try {
      if (typeof d.input !== 'function') return { ok: false, kind: 'undeclared', rev: 0, seq: 0, at: 0, value: null };
      const r = d.input();
      if (!r || typeof r !== 'object') return { ok: false, kind: 'bad-input', rev: 0, seq: 0, at: 0, value: null };
      return r;
    } catch (e) { return { ok: false, kind: 'input-threw', rev: 0, seq: 0, at: 0, value: null }; }
  }
  /**
   * 四个观测面：`probe` 是产物、`ready` 是装配、**`input` 是这一面所依赖的输入**。
   *   为什么第四个谓词必须有：不然「这一面要不要重算」只能靠调用方声明
   *   （粒度在层、且产品侧无人声明）⇒ 增量永远不成立。四个面的真源都读**世界状态**，
   *   故它们的输入统一是世界步进；这**不是**把四个面当同一个（产物、耗时、装配各自独立）。
   *   已知边界：`canonAlign` 的幕表在**设置**侧，改幕表而世界没落盘时它不被判脏（见文件头）。
   */
  const FACES = [
    { key: 'inject', layer: 'inject', probe: function () { return WA.render.visibilityStat(); },
      ready: function () { return !!(WA.render && typeof WA.render.visibilityStat === 'function'); },
      input: function () { return worldRev(); } },
    { key: 'diagnose', layer: 'diagnose', probe: function () { return WA.toolDiag.collect(); },
      ready: function () { return !!(WA.toolDiag && typeof WA.toolDiag.collect === 'function'); },
      input: function () { return worldRev(); } },
    { key: 'canonAlign', layer: 'canonAlign', probe: function () { return WA.canon.alignView(); },
      ready: function () { return !!(WA.canon && typeof WA.canon.alignView === 'function'); },
      input: function () { return worldRev(); } },
    { key: 'worldState', layer: 'worldState', probe: function () { return WA.render.buildWorldSnapshot(); },
      ready: function () { return !!(WA.render && typeof WA.render.buildWorldSnapshot === 'function'); },
      input: function () { return worldRev(); } }
  ];
  const FACE_KEYS = FACES.map(function (d) { return d.key; });
  /**
   * 面可用性：模块与**出口函数**在不在（**同一份判定**给冷/热/基准三处用，不各写一遍）。
   *   ⚠ 判的是「装配」，**不是**「产物」：首版写的 `!!probe()` 是错的——
   *   空世界下 `buildWorldSnapshot()` 合法返回空串（「本轮没东西」），那是正常读出，
   *   却被记成 `absent`（「模块不在、这个面根本没跑」）。两者处置相反：前者什么都不用做，
   *   后者要去修装配。产物空不空与本面无关，故此处只看出口在不在。
   */
  function faceAvail(d) {
    try { return !!d.ready(); } catch (e) { return false; }
  }
  /** 跑一个面：只读真源 + 计时 + 指纹 + 规模（**不留产物正文**）。 */
  function runFace(d, scope) {
    void scope;
    // 缺席**不记样本**：记一笔 0ms 会让该层的 P50 被「没跑」稀释成「很快」——
    //   那与「替缺席编 0ms」是同一个错，只是发生在层的分位数上（文件头「诚实边界」）。
    //   缺席本身由行的 `absent` 计数，不需要靠一笔假样本留下来。
    if (!faceAvail(d)) return { face: d.key, layer: d.layer, ok: false, absent: true, reason: 'module-absent', ms: 0, fp: '', bytes: 0 };
    const t0 = clockWall();
    let v, err = '';
    try { v = d.probe(); } catch (e) { err = String((e && e.message) || e); }
    const ms = clockWall() - t0;
    note('local', ms); record(d.layer, ms); faceNote(d.layer, d.key, ms);
    if (err) { _stat.lastErr = clean(err, 120); return { face: d.key, layer: d.layer, ok: false, absent: false, reason: 'probe-threw', error: err, ms: ms, fp: '', bytes: 0 }; }
    const bytes = sizeOf(v);
    return { face: d.key, layer: d.layer, ok: true, absent: false, reason: '', ms: ms, fp: fingerprint(v), bytes: bytes };
  }
  function runAllFaces(scope) { return FACES.map(function (d) { return runFace(d, scope); }); }

  /**
   * 冷启动基线：四个面**逐面真跑一遍**（`force`），并把结果**写进缓存**。
   *   为什么不走缓存命中：冷启动问的就是「第一次要多久」，缓存命中恰恰是这个问题要排除的情形。
   *   为什么还是要**写**缓存：不写的话，紧跟着的热启动一样全重算（复用率恒 0）——
   *   而面板上两者是**并排**显示的，那个读数会被读成「缓存压根没用」，那是**误报**。
   *   指纹口径与热启动同源（`{dirty:true}`）：于是紧随其后的热启动能真命中，
   *   冷/热之差才等于「缓存真正省下的那一份」。
   * `consistent` 恒为 `null`：冷启动**没有**第二份可比的东西（要判一致性得跑热启动）。
   */
  function coldStart(scope) {
    _stat.lastAt = clockWall();
    const rows = [];
    FACES.forEach(function (d) {
      const r = ensure(d.layer, 'startup:' + d.key, function () { return runFace(d, scope); }, { dirty: true, force: true });
      const v = r.value || {};
      rows.push({ face: d.key, layer: d.layer, stage: 'cold', ok: !!v.ok, ms: (typeof v.ms === 'number' ? v.ms : 0),
        fp: v.fp || '', bytes: v.bytes || 0, absent: !!v.absent, reason: v.reason || (v.ok ? '' : 'probe-failed') });
    });
    return { at: _stat.lastAt, stage: 'cold', rows: rows, totalMs: Math.round(rows.reduce(function (a, x) { return a + x.ms; }, 0) * 100) / 100,
      cold: rows.filter(function (x) { return x.ok; }).length, absent: rows.filter(function (x) { return x.absent; }).length,
      reused: 0, recomputed: rows.length, consistent: null };
  }

  /**
   * 热启动基线：**按层的脏集**决定复用——该层没有脏键就复用，有就重算。
   *   「哪些层受影响」由调用方用 `mark(layer, key, value)` 声明（粒度在层，见文件头口径②）；
   *   一个都没声明过 ⇒ 全层皆「干净」⇒ 全部复用（这正是热路径的语义）。
   *   `force` ⇒ 忽略脏集，全部重算（用来测「不算缓存能省多少」）。
   * `consistent`：对复用的层**在同一次调用里再独立算一遍**，与缓存里那份逐字段比对。
   *   为什么必须真再算一遍：只比「缓存 vs 缓存」是自指的（恒真，验不出任何东西）。
   */
  function warmStart(opts) {
    const o = opts || {};
    _stat.lastAt = clockWall();
    const rows = [];
    FACES.forEach(function (d) {
      const r = ensure(d.layer, 'startup:' + d.key, function () { return runFace(d, o.scope); }, { dirty: true, force: !!o.force });
      const v = r.value || {};
      const row = { face: d.key, layer: d.layer, stage: 'warm', ok: !!r.ok, hit: !!r.hit,
        ms: (r.hit ? 0 : (typeof v.ms === 'number' ? v.ms : 0)),
        fp: v.fp || r.vfp || '', bytes: v.bytes || 0, absent: !!v.absent, reason: v.reason || (r.ok ? '' : (r.error || 'probe-failed')) };
      if (r.hit) {
        // 独立再算一遍（不进缓存）。比的是**产物的指纹**，不是整行——
        //   行里带 `ms`，两次毫秒数几乎必然不同，拿整行比会得到一条**恒假**的判据
        //   （「缓存坏了」与「这个面本来就不稳定」被压成同一个读数，见文件头自纠②）。
        const again = runFace(d, o.scope);
        const same = (!!again.fp && again.fp === v.fp);
        row.check = { ran: true, same: same, freshFp: again.fp, cachedFp: v.fp || '', verdict: same ? 'agree' : '' };
        if (!same) {
          // 有分歧才分诊（一致时零额外开销）：再独立算一遍——
          //   两遍现算**互相一致** ⇒ 面本身是确定的，只有缓存里的那份旧了（stale，真缺陷）；
          //   两遍现算**互不一致** ⇒ 这个面自己不可复现（volatile，如实报，不赖到缓存头上）。
          //   本仓实测的第一例是 `diagnose`：`tool-diag.collect()` 的产物里带 `collectedAt` 时间戳，
          //   于是它每一遍都不同——那不是缓存坏了，是**这个面的产物本身带时间**，
          //   该如实标出来（顺带说明这一层的热启复用本来就不可能命中）。
          const third = runFace(d, o.scope);
          row.check.verdict = (!!third.fp && third.fp === again.fp) ? 'stale' : 'volatile';
        }
      } else row.check = { ran: false, same: null, freshFp: '', cachedFp: '', verdict: '' };
      rows.push(row);
    });
    const checked = rows.filter(function (x) { return x.check.ran; });
    const stale = rows.filter(function (x) { return x.check.verdict === 'stale'; });
    const volatileRows = rows.filter(function (x) { return x.check.verdict === 'volatile'; });
    return { at: _stat.lastAt, stage: 'warm', rows: rows,
      totalMs: Math.round(rows.reduce(function (a, x) { return a + x.ms; }, 0) * 100) / 100,
      reused: rows.filter(function (x) { return x.hit; }).length, recomputed: rows.filter(function (x) { return !x.hit; }).length,
      absent: rows.filter(function (x) { return x.absent; }).length, checked: checked.length,
      stale: stale.map(function (x) { return x.face; }), volatile: volatileRows.map(function (x) { return x.face; }),
      consistent: checked.length ? checked.every(function (x) { return x.check.same === true; }) : null,
      // 「缓存过期」与「这个面本来就不稳定」**分列**：前者是本面的缺陷，后者是被观测面的性质。
      consistentNote: checked.length
        ? (checked.every(function (x) { return x.check.same === true; })
          ? '复用值与现算值指纹一致（' + checked.length + ' 面）'
          : (stale.length ? '缓存过期：' + stale.map(function (x) { return x.face; }).join('/') : '')
            + (stale.length && volatileRows.length ? '；' : '')
            + (volatileRows.length ? '被观测面自身不可复现（非缓存缺陷）：' + volatileRows.map(function (x) { return x.face; }).join('/') : ''))
        : '不可判（本次没有复用项）' };
  }

  /**
   * **增量重算**：按**每一面自己的输入指纹**决定它要不要重算。
   *   与 `warmStart` 的区别（这个区别是真差别，不是措辞）：
   *     · `warmStart` 用调用方声明的**脏集**——粒度在层，且产品侧无人声明 ⇒ 复用率恒 0；
   *     · `partial` 用本面**读真源拿到的输入指纹**（世界步进）——粒度在面，不需要任何人声明。
   *   为什么不去硬抽「源 → 依赖」声明表：空世界下有些源**根本早退**（不碰 store），
   *   隐式依赖在代码里，硬抽出来就是**新造第二套真源**（见文件头）。
   *   输入读不出来（store 缺席 / 未落盘 / 抛错）⇒ 该面**一律重算**；缺席的面不记样本。
   *   `rev` 一并带走：读数里能直接看到「刚刚是按哪个世界步进算的」。
   */
  function partial(scope) {
    _stat.lastAt = clockWall();
    const rows = [];
    FACES.forEach(function (d) {
      const inp = inputOf(d);
      const r = ensure(d.layer, 'partial:' + d.key, function () { return runFace(d, scope); },
        inp.ok ? { rev: inp } : { force: true });
      const v = r.value || {};
      rows.push({ face: d.key, layer: d.layer, ok: !!r.ok, hit: !!r.hit,
        ms: (r.hit ? 0 : (typeof v.ms === 'number' ? v.ms : 0)),
        fp: v.fp || r.vfp || '', bytes: v.bytes || 0, absent: !!v.absent,
        inputKind: inp.kind, inputOk: !!inp.ok, inputRev: inp.rev, inputFp: r.fp, reason: r.reason });
    });
    _stat.partialCalls++;
    const reused = rows.filter(function (x) { return x.hit; }).length;
    _stat.partialReused += reused;
    const rv = worldRev();
    return { at: _stat.lastAt, rows: rows,
      totalMs: Math.round(rows.reduce(function (a, x) { return a + x.ms; }, 0) * 100) / 100,
      reused: reused, recomputed: rows.length - reused,
      reusedFaces: rows.filter(function (x) { return x.hit; }).map(function (x) { return x.face; }),
      recomputedFaces: rows.filter(function (x) { return !x.hit; }).map(function (x) { return x.face; }),
      absent: rows.filter(function (x) { return x.absent; }).length,
      revOk: !!rv.ok, rev: rv.rev, revKind: rv.kind };
  }

  /**
   * 冷算与缓存算的逐字段一致性（规格②的判据）。
   *   三步：① 冷算（force）② 复用（应命中）③ **再独立算一遍**（force）——
   *   ②③ 比对才是真判据（「缓存命中返回的就是现在真算出来的那份」）；
   *   只比 ① 与 ② 是自指的（② 返回的就是 ① 写进去的，恒等）。
   */
  function coldWarmCheck(layer, key, produce, stamp) {
    const cold = ensure(layer, key, produce, { force: true, stamp: stamp });
    const warm = ensure(layer, key, produce, { stamp: stamp });
    const again = ensure(layer, key, produce, { force: true, stamp: stamp });
    const okAll = !!cold.ok && !!warm.ok && !!again.ok;
    return { layer: clean(layer, 24), key: clean(key, 40),
      coldFp: cold.vfp || '', warmFp: warm.vfp || '', freshFp: again.vfp || '',
      sameFields: okAll ? sameValue(cold.value, again.value) : false,
      cachedMatchesFresh: okAll ? sameValue(warm.value, again.value) : false,
      // 三处各自的**动作**如实报出来：①③ 必须是真算（recomputed），② 必须是真命中（hit）。
      //   为什么要把动作也报出来：只报「值一样」验不出「第三遍是不是真的重算了」——
      //   若第三遍其实走了缓存，值与命中值当然一样，判据会**假绿**。
      coldRecomputed: !!cold.recomputed, againRecomputed: !!again.recomputed,
      warmReused: !!warm.hit, coldOk: !!cold.ok, warmOk: !!warm.ok, okAll: okAll };
  }

  /**
   * 四类基准：短文本 / 中等存档 / 长存档 / 低端移动设备。
   *   `lowend` 是**同机放大估计**（无头环境不可真测真机），读数带 `approx:true` 并明写边界。
   * 每档按 `repeats` 重复跑四个面，逐面进历史窗口 ⇒ 档位读数就是分位数。
   * 模块缺席的档位如实计入 `absent` 且不计耗时（不替缺席编 0ms）。
   */
  function bench(cls, scope) {
    const C = clean(cls, 16);
    const def = CLASS_DEF[C];
    if (!def) return { ok: false, reason: 'unknown-class', known: CLASSES.slice() };
    const acc = {};
    let total = 0;
    for (let i = 0; i < def.repeats; i++) {
      FACES.forEach(function (d) {
        const r = runFace(d, scope);
        const row = acc[d.key] || (acc[d.key] = { face: d.key, layer: d.layer, ok: false, ms: 0, absent: 0, runs: 0 });
        row.runs++;
        row.ms = Math.round((row.ms + (r.ms || 0)) * 100) / 100;
        if (r.absent) row.absent++;
        if (r.ok) { row.ok = true; total = Math.round((total + (r.ms || 0)) * 100) / 100; }
      });
    }
    const rows = FACE_KEYS.map(function (k) { return acc[k]; });
    return { ok: true, cls: C, repeats: def.repeats, budget: def.budget, approx: !!def.approx, note: def.note,
      rows: rows, totalMs: total, split: split(),
      baselines: (function () { const o = {}; LAYERS.forEach(function (L) { const b = baseline(L); o[L] = { p50: b.p50, p95: b.p95, max: b.max, subTick: b.subTick, n: b.n }; }); return o; })() };
  }
  function benchAll(scope) { const out = {}; CLASSES.forEach(function (C) { out[C] = bench(C, scope); }); return out; }

  /**
   * v2.123.0 P4：**档位对照面**（短 / 中 / 长 / lowend × 本地 / API 分列）。
   *
   * 治的病：`bench()` 与 O1 的成本账都只给**单点**读数 ——「够快吗」没有可比参照系；
   *   而 `split()` 把本地引擎耗时与宿主 API 耗时混在一个 `totalMs` 里（两类成本不同源）。
   *   本面把四档并排，并把**本地面**与 **API 面**分开列：
   *     · 本地面 = `local`（本进程计算）+ `serialize`（序列化），本面自己能量的；
   *     · API 面  = `host`（宿主 API 调用）—— **须外部上报**，无头环境无宿主调用面。
   *
   * 三条口径（每条对应本仓付过价的一处）：
   *   ① **每档的本地 / API 读数取本档前后的差值**，不是全局累计 —— `_span` 是自装载以来
   *      的累计桶，跨档只增不减。直接读它，第四档会把前三档跑过的量一起算进来
   *      （看着有值、却没有归属），这正是「读数张冠李戴」的老账。故本面在档前档后各取一次
   *      `split()`，报的是 `after - before`。
   *   ② **API 面无读数就如实说无读数**（`declared.host === false` + `apiReported:false`），
   *      绝不拿 0ms 冒充「API 很快」。与 `split()` 的既有口径逐字同源。
   *   ③ **lowend 档不参与判定**：它是同机放大估计（`approx:true`），读数带的是估计值。
   *      故每档单列 `judgeable = !approx`，`minSamples` 只作为**够不够判**的门槛被读出；
   *      本面**不下任何「快 / 慢」结论**——它是对照面，不是判定面。
   *
   * 漂移边界（与 v2.119 族⑥同源，写进读数）：墙钟读数**随机器漂移**（同机自比可用、
   *   跨机不可比）。故本面对外承诺的是**结构项数恒定**（`classes.length` / `faces.length` /
   *   `splitKeys.length` / 每档 `split` 键集合），毫秒值随现场变。任何判据只许断言结构项数，
   *   不许断言具体 ms —— 与 `tests/perf-regression-gate.js` 的四条否定式口径同向。
   *
   * `opts.dryRun === true` ⇒ **只报结构面，不跑任何一档**（诊断是旁观者：看一眼体检
   *   不该等于跑一轮基准 —— 与 `partial()` 不挂进注入链的那条裁决逐字同）。
   */
  function bandCompare(opts) {
    const o = opts || {};
    const classes = CLASSES.slice();
    const minSamples = PERF_THRESHOLD.minSamples;
    const bands = {};
    classes.forEach(function (C) {
      const def = CLASS_DEF[C] || {};
      const judgeable = !def.approx;
      if (o.dryRun) {
        // 结构面：档位定义 + 判定门槛。读数**一律不编**（`ran:false` 是实情，不是 0ms）。
        const sp = split();
        bands[C] = { cls: C, repeats: def.repeats, budget: def.budget, approx: !!def.approx, note: def.note || '',
          minSamples: minSamples, judgeable: judgeable, ran: false,
          faces: FACE_KEYS.length, totalMs: null,
          split: { localMs: null, hostMs: null, serializeMs: null, renderMs: null,
            declared: { local: true, host: sp.declared.host, serialize: true, render: sp.declared.render },
            apiReported: !!sp.declared.host, undeclared: sp.undeclared.slice(), localApiSeparated: true },
          samples: null, baselines: null };
        return;
      }
      const before = split();
      const r = bench(C, o.scope);
      const after = split();
      const d = function (k) { return Math.round(((after[k] || 0) - (before[k] || 0)) * 100) / 100; };
      // 该档跑完后注入层窗口的样本数：它才是「这一档够不够判」的现场依据。
      const win = (function () { try { return baseline('inject').window; } catch (e) { return 0; } })();
      bands[C] = { cls: C, repeats: r.repeats, budget: r.budget, approx: !!r.approx, note: r.note,
        minSamples: minSamples, judgeable: judgeable, ran: true,
        faces: (r.rows || []).length, totalMs: r.totalMs,
        split: { localMs: d('localMs'), hostMs: d('hostMs'), serializeMs: d('serializeMs'), renderMs: d('renderMs'),
          declared: { local: after.declared.local, host: after.declared.host, serialize: after.declared.serialize, render: after.declared.render },
          undeclared: after.undeclared.slice(),
          apiReported: !!after.declared.host,
          localApiSeparated: true },
        samples: { n: win, need: minSamples, sufficient: win >= minSamples },
        baselines: r.baselines || null };
    });
    return {
      classes: classes, bands: bands, minSamples: minSamples,
      faces: FACE_KEYS.slice(), splitKeys: SPANS.slice(),
      dryRun: !!o.dryRun,
      localApiSplit: true,
      judgeableClasses: classes.filter(function (C) { return !(CLASS_DEF[C] || {}).approx; }),
      approxClasses: classes.filter(function (C) { return !!(CLASS_DEF[C] || {}).approx; }),
      apiNote: '宿主 API 耗时须外部上报；无头环境无宿主调用面 ⇒ host 恒未上报，如实记 undeclared（不写成 0ms）',
      driftNote: '墙钟读数随机器漂移（同机自比可用、跨机不可比）；本面对外承诺的是**结构项数恒定**，毫秒值随现场变',
      note: '四档并排 + 本地 / API 分列（每档取前后差值，非全局累计）；lowend 为同机放大估计（不参与判定）'
    };
  }

  function stat() {
    return { calls: _stat.calls, marks: _stat.marks, reuse: _stat.reuse, recompute: _stat.recompute, miss: _stat.miss,
      evicted: _stat.evicted, forced: _stat.forced, dirtyHit: _stat.dirtyHit,
      historyCap: HISTORY_CAP, fingerprintCap: FINGERPRINT_CAP,
      layers: LAYERS.length, faces: FACES.length, lastAt: _stat.lastAt, lastErr: _stat.lastErr,
      partialCalls: _stat.partialCalls, partialReused: _stat.partialReused,
      fpCollisions: _stat.fpCollisions, evictedPolicy: _stat.evictedPolicy, flameDropped: _stat.flameDropped,
      alertCount: _stat.alertCount, lastAlert: _stat.lastAlert, cachePolicy: _cachePolicy,
      rev: worldRev(),
      dirty: (function () { const d = dirtyAll(); return LAYERS.reduce(function (a, L) { return a + d[L].length; }, 0); })() };
  }
  function summaryText() {
    try {
      const s = split();
      const b = baseline('inject');
      const d = stat();
      return '性能面：注入面 P50 ' + b.p50 + 'ms / P95 ' + b.p95 + 'ms（窗口 ' + b.window + '/' + HISTORY_CAP + '）'
        + '；本地 ' + s.localMs + 'ms / 序列化 ' + s.serializeMs + 'ms / 宿主 ' + (s.declared.host ? s.hostMs + 'ms' : '未上报')
        + ' / 渲染 ' + (s.declared.render ? s.renderMs + 'ms' : '未上报')
        + '；复用 ' + d.reuse + ' / 重算 ' + d.recompute + ' / 失败 ' + d.miss
        + (d.fpCollisions ? '；**指纹冲突 ' + d.fpCollisions + '**' : '')
        + (d.alertCount ? '；劣化告警 ' + d.alertCount : '');
    } catch (e) { return '性能面读取失败'; }
  }

  WA.perfTrace = {
    LAYERS: LAYERS, LAYER_LABEL: LAYER_LABEL, SPANS: SPANS, CLASSES: CLASSES, CLASS_DEF: CLASS_DEF,
    HISTORY_CAP: HISTORY_CAP, FINGERPRINT_CAP: FINGERPRINT_CAP,
    fingerprint: fingerprint,
    mark: mark, dirtyOf: dirtyOf, dirtyAll: dirtyAll, consume: consume,
    ensure: ensure, slots: slots,
    coldWarmCheck: coldWarmCheck,
    coldStart: coldStart, warmStart: warmStart,
    bench: bench, benchAll: benchAll, bandCompare: bandCompare,
    baseline: baseline, curve: curve, curveAll: curveAll,
    noteSpan: noteSpan, split: split, partial: partial,
    CACHE_CAP: CACHE_CAP, EVICT_POLICIES: EVICT_POLICIES, FLAME_CAP: FLAME_CAP,
    snapshot: snapshot, importSnapshot: importSnapshot,
    setCachePolicy: setCachePolicy, cacheStat: cacheStat, heatHistogram: heatHistogram,
    thresholds: thresholds, setThresholds: setThresholds, spikeOf: spikeOf, alerts: alerts,
    flamegraph: flamegraph,
    stat: stat, summaryText: summaryText
  };
  if (WA.log) WA.log('info', '性能基线与分层增量已加载（纯内存观测：不写存档、不落盘）');
})();