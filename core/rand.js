/**
 * WorldAxis core/rand.js (v2.14.0) — 可复现性（第八面：随机源治理）
 *
 * 为什么需要它：
 *   本仓库已把写侧（v2.6/2.7）、删侧（v2.9）、读侧（v2.10）、活性面（v2.11）、
 *   UI 渲染路径（v2.12）、挤出侧（v2.13）逐一收口。但**没有任何一处治理随机源**：
 *   全库 16 个产品文件裸调 `Math.random()`，共 30 余处。其中 5 处是**行为性决策**——
 *     · engines/evolution.js  ×2  骰子决定事件链「成功 / 受挫 / 保持」；
 *     · engines/evolution.js      风声消散骰决定哪条风声本轮消失；
 *     · engines/regional.js ×2    概率决定本轮是否触发区域突发事件、抽中哪种类型；
 *     · engines/horizon.js        远景通道是否开火；
 *     · engines/memory-sampler.js 指数采样决定**谁被保留、谁被挤出**。
 *
 *   这不是「代码不够优雅」，而是一个已经被 v2.13.0 现场证明的真缺陷：
 *   v2.13.0 让「长局里丢的是谁」第一次可见（逐站点 lastWhat）。但**丢的那个「谁」
 *   正是被随机采样挑中的**——同一个存档重放一次，被挤出的是另一批人。
 *   于是「挤出侧报表」在两次运行间不可比，「我修好了吗」这个问题在原理上无法回答。
 *   观测面做完了，被观测的过程本身却是不可复现的。
 *
 * 两条口径（本模块存在的全部意义）：
 *   ① **随机分两类，不得混流**。
 *      · **决策流**（decision）——决定「发生什么」：掷骰、抽样、是否触发。
 *        必须可复现：同种子同序列。走 `next()/int()/chance()/pick()/pickWeighted()`。
 *      · **标识流**（identity）——决定「它叫什么」：id / writerId。
 *        只需唯一、不需复现。时间戳 + 递变计数器足以唯一，
 *        因此 `id()` **不从决策流抽数**（抽了就会让「多生成一个 id」平移掉整条决策序列，
 *        这正是最难查的一类不可复现）。id 里那几位随机字符纯粹是给人看的噪声。
 *   ② **通道隔离**。单一全局流有个致命性质：**调用次数的任何变化都会平移后续全部随机**。
 *      evolution 多掷一次骰，horizon 的开火判定跟着变，采样结果再跟着变——
 *      于是「改 A 模块」会静默改掉 B 模块的行为，且无任何痕迹。
 *      故按通道名派生独立流（`seed:channel` 哈希），通道之间互不影响。
 *      通道名是**已消费面**：`channels()` 让「谁在用随机」第一次可枚举。
 *
 * 记账层次（与写侧 writes / 删侧 removes / 挤出侧 evicts 对偶）：
 *   · draws        —— 决策流真实抽数次数（可复现的那些）；
 *   · ids          —— 标识流生成的 id 数（不参与复现）；
 *   · reseeds      —— 重新播种次数（把种子换了，即「从此刻起重放」）；
 *   · seedSource   —— 种子来源：explicit（显式设定，用于复现）| auto（首抽自动生成）；
 *   · failed / failedBy —— 非法参数（种子为 NaN/Infinity/对象、区间反向）不静默接受，
 *                    归因后**退回默认区间**而不是产生 NaN——NaN 会顺着算术传播，
 *                    把「掷骰」变成恒假的比较（v2.4.0 已在进化骰上吃过一次这个坑）。
 *   · byChannel   —— 逐通道 draws（「谁在用随机、用了多少」）。
 *
 * 不做什么：**不写 localStorage**。种子只活在内存里，不新增任何持久键——
 *   持久键预算已由 store 的登记表管着，随机源没有资格占地。
 *   代价：刷新页面即换种子（自动种子）。要复现就显式 `seed(n)`，这是调用方的责任。
 *
 * v2.89.0 O2（第四十三面：回放不了的那一步）——**抽取磁带与回放模式**。
 *   到这里为止，「可复现」只做到**声明层**：`randStat().reproducible` 说「这一轮是显式
 *   播种的」，却**没有任何地方能证明这句话**。种子相同的两次运行之间，还有一个东西在动：
 *   **调用顺序**。同一种子只在「谁在第几步取数、取了几次、走的哪条通道」逐字相同时才给出
 *   同一序列；而推进逻辑一旦分支（条件满足 / 未满足、链被取消 / 到期），两侧的抽取序列
 *   就错位，此后每个数都不同——而错位**不会报错**，它只是安静地给出另一套数。
 *   于是「这一轮可复现吗」永远只能靠人去比对两份世界状态，而两份状态本来就不该相同。
 *
 *   两条口径（与「决策流 / 标识流」的既有切分正交）：
 *     · **磁带记的是「答案 + 位置」**：每次决策取数（与 `id()` 的噪声取数）按顺序记
 *       `{c: 通道名, v: 取到的值, k: 'd'|'i'}`。种子不记「推导过程」而记「取出的数」——
 *       这样即使调用顺序变了，**位置对不上会被当场报出来**，而不是静默换一套数。
 *     · **回放模式不碰派生流**：回放时 `next()` / `id()` 的取数全部来自磁带，`streamFor`
 *       连派生都不发生——于是回放**不消耗、也不重置**当前会话的随机序列。若为了回放去
 *       `seed()` 一次，退出回放后整个会话的后续序列就换了，而调用方无从知道。
 *       这是「取证动作不得改变被取证对象」的最低要求。
 *
 *   三条**绝不静默**（对齐本模块的 `failed` / `failedBy` 口径）：
 *     ① 通道名对不上 ⇒ 记 `miss` 并给出 `lastMiss{want,got,why}`，**不猜、不顺延**；
 *     ② 位置越界（磁带枯竭）⇒ 记 `miss`，值退 `0`（回放不得抛，也不得假装成功）；
 *     ③ 值非法（NaN/Infinity）⇒ 记 `miss`，不让它顺着算术传播成「恒假比较」（v2.4.0 的坑）。
 *   回放期间 `next()` 照常 `tick()`：`byChannel` 于是反映**回放侧真的问了什么**，
 *   与磁带通道构成不一致本身就是一条可断言的证据。
 *
 *   不做什么：**不落盘**。磁带只活在内存里，由调用方（causal.evidence）交给持有者；
 *     与种子同规格——持久键预算不因取证功能扩张。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // ── 32 位哈希（FNV-1a）：把「种子 + 通道名」压成一个独立的流种子 ──
  function hash32(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // ── mulberry32：小、快、周期足够，且状态只依赖一个 32 位整数（可回放）──
  // 选它而不选 Math.random 的理由就是「状态可枚举」：给同一个 32 位种子，
  // 序列逐位相同——这是可复现性的全部前提。
  function mulberry32(a) {
    let x = a >>> 0;
    return function () {
      x = (x + 0x6D2B79F5) >>> 0;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── 种子单源（内存，不落盘）──
  const DEFAULT_SEED_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';   // 去易混字符（0/1/i/l/o）
  let __seed = 0;
  let __seedSource = 'none';
  let __seedAt = 0;
  const __streams = {};         // channel -> 生成函数（按需派生，一旦派生不重置）
  const __stats = {
    draws: 0, ids: 0, reseeds: 0,
    failed: 0, failedBy: {}, byChannel: {},
    lastAt: 0, lastChannel: null, lastSeedAt: 0
  };
  let __uidCounter = 0;

  // ── v2.89.0 O2：抽取磁带与回放模式 ──────────────────────
  //   __mode === 'live'   → 取数走派生流；若磁带开着则顺手记账（录制）
  //   __mode === 'replay' → 取数全部来自磁带；派生流不派生、不消耗
  let __mode = 'live';
  let __tape = null;          // {seed, entries:[{c,v,k}], open, idx, used, miss, lastMiss}
  // v2.89.0 O2 自纠：最近**收卷**的一卷磁带。为什么还要单独存一份：
  //   回放结束时 `__tape` 会被清掉（那只是走位用的索引卷）。此前没有这份留存，
  //   于是「刚复核完一轮」之后 `tape()` 报 entries=0 —— 一个**只读的取证动作**
  //   （replayWith）把 `evidence().replayable` 从 true 翻成了 false：取证擦掉了证据。
  let __lastTape = null;
  // ── v2.97.0 O10：抽取的**语义坐标** ─────────────────────
  //   它治的病（v2.89.0 O2 未覆盖项坐实）：磁带记下了「哪一次抽象取了什么值、在第几格」，
  //   但那一格**发生在世界的哪一步**没有出口。于是 `miss` 报出「第 7 格通道对不上」时，
  //   复核的人只能回去数代码——而「第 7 格」这个位置量对作者毫无意义。
  //   坐标把位置量翻译成**语义量**：第几轮、哪一段、段内第几步。
  //
  //   口径（三条，全是否定式）：
  //     ① 坐标是**标记出来的**，不是猜出来的。没人标记时照实报 `round:null` / `label:''`
  //        ——为无标记的磁带编一个轮次，比没有坐标更坏（它会让复核结论不可信）。
  //     ② 坐标只在**录制时**落进磁带：回放期 `take()` 不写磁带，故回放不会把坐标改掉。
  //     ③ `n`（段内第几步）由磁带长度现算，是**位置真源**；坐标是附加的语义层，
  //        两者分列——坐标标错时，位置仍然对得上。
  let __mark = { round: null, label: '', at: 0 };

  function noteFail(why) {
    __stats.failed++;
    __stats.failedBy[why] = (__stats.failedBy[why] || 0) + 1;
    try { WA.log('warn', '随机源参数非法: ' + why); } catch (e) {}
  }
  function channelOf(ch) {
    const name = (ch === undefined || ch === null || ch === '') ? 'default' : String(ch);
    return name;
  }
  function streamFor(name) {
    if (!__streams[name]) {
      // 通道不直接吃主种子，而吃 hash(seed + ':' + 通道名)：
      //   ① 通道之间互不影响（改一个模块的抽数不动另一个模块的序列）；
      //   ② 不同通道名的种子分布均匀，不会出现「相邻通道序列相似」。
      __streams[name] = mulberry32(hash32(__seed + ':' + name));
    }
    return __streams[name];
  }
  function ensureSeed() {
    if (__seedSource === 'none') {
      // 全库唯一一处 Math.random 消费点——只用来产生**自动种子**。
      // 门禁 G19 断言：除本文件这一行外，产品代码零裸调。
      __seed = (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0) || 1;
      __seedAt = (WA.clock ? WA.clock.wallNow() : Date.now());
      __seedSource = 'auto';
      __stats.lastSeedAt = __seedAt;
    }
  }
  function tick(name) {
    __stats.draws++;
    __stats.byChannel[name] = (__stats.byChannel[name] || 0) + 1;
    __stats.lastChannel = name;
    __stats.lastAt = (WA.clock ? WA.clock.wallNow() : Date.now());
  }

  // ── 决策流 ──────────────────────────────────────────────
  /**
   * 底层取数（**不记账**）。记账与取数分开的唯一理由：
   *   `id()` 的噪声也从自己的通道取数（保证「多生成一个 id」不平移决策序列），
   *   但那不是一次**决策**。若让 id 噪声计进 draws，「本轮掷了几次骰」这个数就不再可信。
   *   通道隔离（seed:channel 派生）保证 id 通道的消耗对决策通道零影响。
   */
  function draw(name) {
    ensureSeed();
    // v2.89.0 O2：回放模式下标识流的**噪声抽取**也从磁带取。
    //   边界如实（本版自纠，实测得出的，不是推演）：复现的是「抽到的随机噪声」，
    //   **时间戳与递变计数器不参与回放**——`cs_<时间戳>_<计数器>_<噪声>` 里只有噪声逐字相同
    //   （实测 a=`..._1_3d4c` / b=`..._2_3d4c`：噪声同、计数器不同）。
    //   理由不是偷懒：计数器与时间戳的职责是**唯一性**（同毫秒不撞、跨会话不撞）。
    //   把它们也复现，两次回放会产出同一个 id，而世界里的那份还在——用唯一性换可复现性是净亏。
    if (__mode === 'replay') {
      const r = take(name, 'i');
      return r.ok ? r.v : 0;
    }
    const v = streamFor(name)();
    noteTape(name, v, 'i');
    return v;
  }

  // ── v2.89.0 O2：磁带读取（回放侧唯一取数通道）────────────
  /**
   * 按**位置**取一格磁带。三条绝不静默（见文件头注）。
   * 位置**无论命中与否都前进一格**——这是错位可被检出的前提：
   *   若只在命中时前进，错位会退化成「同一个值反复取」，反而更像「一切正常」。
   */
  function take(name, kind) {
    const t = __tape;
    if (!t) return { ok: false, why: 'no-tape' };
    const e = (t.idx < t.entries.length) ? t.entries[t.idx] : null;
    t.idx++;
    if (!e) {
      // v2.97.0 O10：未命中同时报**语义坐标**——「第 7 格对不上」在复核时是位置量，
      //   而「第 2 轮 causal.tick 段第 3 步对不上」才是能回去查现场的量。
      t.miss++; t.lastMiss = { at: t.idx - 1, want: name, got: '(磁带枯竭)', why: 'exhausted',
        n: t.idx, r: __mark.round, s: __mark.label };
      if (!t.firstMiss) t.firstMiss = t.lastMiss;
      return { ok: false, why: 'exhausted' };
    }
    t.used++;
    if (String(e.c) !== name) {
      t.miss++; t.lastMiss = { at: t.idx - 1, want: name, got: String(e.c), why: 'channel',
        n: t.idx, r: __mark.round, s: __mark.label, expectN: Number(e.n) || 0, expectR: e.r };
      if (!t.firstMiss) t.firstMiss = t.lastMiss;
      return { ok: false, why: 'channel' };
    }
    if (String(e.k) !== kind) {
      t.miss++; t.lastMiss = { at: t.idx - 1, want: name, got: String(e.c), why: 'kind:' + String(e.k) };
      if (!t.firstMiss) t.firstMiss = t.lastMiss;
      return { ok: false, why: 'kind' };
    }
    const v = Number(e.v);
    if (!isFinite(v)) {
      t.miss++; t.lastMiss = { at: t.idx - 1, want: name, got: String(e.c), why: 'bad-value' };
      if (!t.firstMiss) t.firstMiss = t.lastMiss;
      return { ok: false, why: 'bad-value' };
    }
    return { ok: true, v: v };
  }
  /**
   * 录制：只记**答案**，不记推导过程（调用顺序错位才会被位置检出来）。
   *   v2.97.0 O10：同时落**语义坐标**（`n` 段内第几步 / `r` 轮次 / `s` 段名）。
   *   `n` 是位置真源（由磁带长度现算）；`r`/`s` 取自当前标记，未标记即 null / ''。
   */
  function noteTape(name, v, kind) {
    if (!__tape || !__tape.open) return;
    __tape.entries.push({ c: name, v: v, k: kind,
      n: __tape.entries.length + 1, r: __mark.round, s: __mark.label });
  }

  /**
   * 取一个 [0,1) 实数（决策流，计入 draws）。**唯一**的决策取数入口，其余都是它的规约。
   * v2.89.0 O2：`tick()` 在两种模式下都照跑——回放侧的 `byChannel` 于是是「它真的问了什么」，
   *   与磁带构成比对即可暴露调用顺序漂移（若回放里少问一次，那个通道的计数当场偏低）。
   */
  function next(ch) {
    const name = channelOf(ch);
    tick(name);
    if (__mode === 'replay') {
      const r = take(name, 'd');
      return r.ok ? r.v : 0;
    }
    const v = streamFor(name)();
    noteTape(name, v, 'd');
    return v;
  }
  /**
   * 区间整数 [min, max]（含两端）。
   * 参数非法（非整数 / 反向区间）→ 记 failed 并**退回默认区间**，绝不产 NaN：
   *   NaN 会让 `dice > threshold` 恒假、`dice <= chance` 恒假，两个分支同时静默吞掉
   *   （v2.4.0 已在进化骰的 threshold 上踩过同型的坑）。
   */
  function int(min, max, ch) {
    let lo = Math.floor(Number(min)), hi = Math.floor(Number(max));
    if (!isFinite(lo) || !isFinite(hi)) { noteFail('bad-range:' + min + '..' + max); lo = 1; hi = 100; }
    if (hi < lo) { noteFail('reversed-range:' + lo + '..' + hi); const t = lo; lo = hi; hi = t; }
    return lo + Math.floor(next(ch) * (hi - lo + 1));
  }
  /** 1..sides 的骰子（掷骰语义的显式命名——读代码的人一眼知道这是「随机决策」） */
  function dice(sides, ch) {
    const s = Math.floor(Number(sides));
    if (!isFinite(s) || s < 1) { noteFail('bad-sides:' + sides); return int(1, 100, ch); }
    return int(1, s, ch);
  }
  /** 概率判定：p 为 [0,1]；p<=0 恒假，p>=1 恒真（**不抽数**——抽了会平移序列，而结果恒定） */
  function chance(p, ch) {
    const v = Number(p);
    if (!isFinite(v)) { noteFail('bad-chance:' + p); return false; }
    if (v <= 0) return false;
    if (v >= 1) return true;
    return next(ch) < v;
  }
  /** 等概率取一个元素；空数组返回 null（消费端须显式处理，不返回假元素） */
  function pick(arr, ch) {
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr[int(0, arr.length - 1, ch)];
  }
  /** 加权抽取（区域事件类型表用）。权重非正则整体退回等概率并归因。 */
  function pickWeighted(items, weightOf, ch) {
    if (!Array.isArray(items) || !items.length) return null;
    const wf = (typeof weightOf === 'function') ? weightOf : function (x) { return (x && x.weight) || 0; };
    const ws = items.map(function (x) { const w = Number(wf(x)); return (isFinite(w) && w > 0) ? w : 0; });
    const total = ws.reduce(function (a, b) { return a + b; }, 0);
    if (!(total > 0)) { noteFail('bad-weights'); return pick(items, ch); }
    let roll = next(ch) * total;
    for (let i = 0; i < items.length; i++) { roll -= ws[i]; if (roll <= 0) return items[i]; }
    return items[items.length - 1];
  }

  // ── 标识流（唯一性优先，与决策流分离）────────────────────
  /**
   * 可读且唯一的 id：`prefix + 时间戳36 + '_' + 递变计数36 + '_' + 4位噪声`。
   * 唯一性由「时间戳 + 递变计数器」保证（跨会话靠前者、同毫秒内靠后者），
   * 末尾噪声**只从 'id' 通道取**——即便它被抽空也不影响任何决策序列。
   * 为什么不做成「全随机」：全随机 id 无法保证同毫秒内不撞；全计数器无法跨会话不撞。
   */
  function id(prefix, noiseLen, ch) {
    const n = Math.max(0, Math.min(8, Math.floor(Number(noiseLen)) || 4));
    const name = channelOf(ch || 'id');
    let noise = '';
    for (let i = 0; i < n; i++) {
      const k = Math.floor(draw(name) * DEFAULT_SEED_CHARS.length) % DEFAULT_SEED_CHARS.length;
      noise += DEFAULT_SEED_CHARS[k];
    }
    __uidCounter = (__uidCounter + 1) % 0xFFFFFF;
    __stats.ids++;
    // v2.15.0: 时间戳走**决策时间**（clock.now）而非墙钟——归因修正。
    //   理由：id 是**进存档的产物**（伏笔 id `fs_*` 进 draft.memory.foreshadows、
    //   消息 id `wax_*` 进 entries、`worldaxis_writer_id` 与 meta.writer 一并落盘），
    //   而冻结时钟的**全部意义**就是「同一份存档重放两次，写进磁盘的每一个可复现字段都相同」。
    //   若这里取墙钟，则即便种子与冻结时刻都指定了，两次重放生成的 id 仍必然不同
    //   ⇒「逐字节相同的存档」在原理上仍然做不到，本版命题只做到一半。
    //   这与 v2.14.0 立的「标识流不占决策序列」并不冲突：那条约束说的是**抽数**不从决策流取，
    //   本条说的是**时间戳**必须可复现——两者正交，各自服务于不同的性质。
    //   唯一性不受影响：冻结时时间戳是常量，但递变计数器 __uidCounter 仍在同会话内单调递增。
    return String(prefix || '') + (WA.clock ? WA.clock.now('rand.id') : Date.now()).toString(36) + '_' + __uidCounter.toString(36) + (noise ? '_' + noise : '');
  }

  // ── 种子管理 ────────────────────────────────────────────
  /**
   * 显式播种（复现场景：同种子 → 同序列）。
   * 接受：数字、数字字符串、布尔。其余（NaN/Infinity/对象/数组）**拒绝**并归因，
   * 保持原种子不变——静默接受一个 NaN 种子会让「我以为复现了，其实没有」，
   * 这是本模块最不能犯的错（它会让复现结论本身不可信）。
   * @returns {boolean} 是否成功播种
   */
  function seed(v) {
    let n = null;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string' && v !== '' && isFinite(Number(v))) n = Number(v);
    else if (typeof v === 'boolean') n = v ? 1 : 0;
    if (n === null || !isFinite(n)) { noteFail('bad-seed:' + (typeof v)); return false; }
    __seed = (Math.floor(Math.abs(n)) % 0xFFFFFFFF) >>> 0 || 1;
    __seedSource = 'explicit';
    __seedAt = (WA.clock ? WA.clock.wallNow() : Date.now());
    __stats.lastSeedAt = __seedAt;
    // 清空派生流：旧通道的生成器状态属于旧种子，留着会让「播种后继续抽」串到旧序列
    Object.keys(__streams).forEach(function (k) { delete __streams[k]; });
    return true;
  }
  /** 换一个自动种子（丢弃当前序列，从此刻起重新开始）——用于「确实要换随机」的显式动作 */
  function reseed() {
    __seed = 0; __seedSource = 'none';
    Object.keys(__streams).forEach(function (k) { delete __streams[k]; });
    __stats.reseeds++;
    ensureSeed();
    return __seed;
  }

  // ── 只读视图（供诊断 / 面板 / 健康分消费）──────────────
  // ── v2.89.0 O2：磁带公开面（五个口，全部有真实消费方：causal.evidence /
  //   面板「回放」按钮 / 诊断 secCausal）────────────────────
  /** 只读视图：任何模式下都可读（未录制时为 live 空卷） */
  function tapeInfo() {
    // 无在卷时回落到最近收卷的一卷（v2.89.0 O2 自纠）：复核只该丢掉走位用的索引卷，
    //   不该让「上一轮录了什么」变得不可见。
    const t = __tape || __lastTape;
    const chans = {};
    if (t) t.entries.forEach(function (e) { chans[e.c] = 1; });
    return {
      mode: __mode,
      open: !!(t && t.open),
      seed: t ? t.seed : (__seedSource === 'none' ? null : __seed),
      entries: t ? t.entries.length : 0,
      values: t ? t.entries.filter(function (e) { return e.k === 'd'; }).length : 0,
      idx: t ? t.idx : 0,
      used: t ? t.used : 0,
      miss: t ? t.miss : 0,
      lastMiss: t ? (t.lastMiss || null) : null,
      channels: Object.keys(chans).sort(),
      // 磁带种子与当前会话种子是否一致：不一致时，这次回放**不构成对当前会话的复现依据**
      //   （它只复现了磁带自己的那一轮）。三者含义不同：true / false / null（当前无种子）。
      seedMatched: (t && __seedSource !== 'none') ? (Number(t.seed) === __seed) : null,
      // v2.97.0 O10：语义坐标面。`steps` 是段内步数（位置真源），`coords` 是逐轮分组
      //   （语义读法：这一卷磁带横跨了世界的哪几轮、每轮各取了几次数）。
      //   未标记的格归入 `(未标记)` 一组并照实计数——丢掉它们等于把「没坐标」当「没发生过」。
      steps: t ? t.entries.length : 0,
      coord: coordOf(),
      coords: (function () {
        if (!t) return [];
        const by = {}, order = [];
        t.entries.forEach(function (e) {
          const key = (e && e.r !== undefined && e.r !== null) ? String(e.r) : '(未标记)';
          if (!by[key]) { by[key] = { round: (e && e.r !== undefined && e.r !== null) ? e.r : null, count: 0, first: 0, last: 0, labels: {} }; order.push(key); }
          const g = by[key];
          g.count++;
          const n = Number(e && e.n) || 0;
          if (!g.first || (n && n < g.first)) g.first = n;
          if (n && n > g.last) g.last = n;
          const lb = String((e && e.s) || '');
          if (lb) g.labels[lb] = (g.labels[lb] || 0) + 1;
        });
        return order.map(function (k) { return by[k]; });
      })()
    };
  }
  /**
   * v2.97.0 O10：打一个语义坐标标记，返回**上一个**标记（供调用方成对还原）。
   *   为什么返回旧值而不是内置栈：标记是**调用方的事**（调用方才知道这一轮是第几轮、
   *   这一段叫什么），引擎替它维护一个栈只会让「谁负责还原」变得含糊。
   *   嵌套调用用 `const prev = markCoord(a,b); try {...} finally { markCoord(prev.round, prev.label, prev.at); }`。
   *   第三参 `at` 是**还原用**：不传则取当前时刻；传了就照传（还原到「未标记」时须传 0，
   *   否则回到初始态却带着一个非零时刻——`coordOf()` 的三态自洽性当场被破坏）。
   */
  function markCoord(round, label, at) {
    const prev = { round: __mark.round, label: __mark.label, at: __mark.at };
    __mark = { round: (round === undefined ? null : round), label: String(label === undefined || label === null ? '' : label).slice(0, 40),
      at: (at === undefined ? (WA.clock ? WA.clock.wallNow() : Date.now()) : at) };
    return prev;
  }
  /** 当前语义坐标（只读）。未标记时 round 为 null、label 为空串——**不编一个默认轮次**。 */
  function coordOf() {
    return { round: __mark.round, label: __mark.label, at: __mark.at,
      marked: __mark.round !== null || !!__mark.label };
  }
  /** 开一卷磁带开始录制。withValues=false 只记位置与通道（省内存，用于只看漂移） */
  function beginTape(withValues) {
    if (__mode === 'replay') return { ok: false, reason: 'in-replay' };
    if (__tape && __tape.open) return { ok: false, reason: 'already-recording' };
    __tape = { seed: (__seedSource === 'none' ? null : __seed), entries: [], open: true,
      idx: 0, used: 0, miss: 0, lastMiss: null, withValues: withValues !== false };
    return { ok: true, seed: __tape.seed, mode: __mode };
  }
  /** 收卷。返回这卷磁带（值取自入参 `into` 或返回值，本模块不持有历史卷） */
  function endTape() {
    if (!__tape || !__tape.open) return { ok: false, reason: 'not-recording' };
    __tape.open = false;
    const out = {
      seed: __tape.seed, open: false, entries: __tape.entries.slice(),
      recordedAt: (WA.clock ? WA.clock.wallNow() : Date.now())
    };
    if (__tape.withValues === false) {
      out.entries = out.entries.map(function (e) { return { c: e.c, k: e.k }; });
      out.noValues = true;
    }
    // 留存一份：收卷之后这卷磁带就是「上一轮可复核的证据」，要活过随后的任何复核动作
    __lastTape = out;
    return { ok: true, tape: out, count: out.entries.length, seed: out.seed };
  }
  /**
   * 进入回放。**不重播种子、不重置派生流**——回放期间一切取数走磁带，
   *   于是退出后会话的随机序列与进入前**逐位相同**（取证不改被取证对象）。
   * @param {object} t 由 endTape 产出的磁带（未 open）
   * @returns {{ok:boolean, reason?:string}}
   */
  function replay(t) {
    if (!t || !Array.isArray(t.entries)) return { ok: false, reason: 'bad-tape' };
    if (t.open) return { ok: false, reason: 'tape-open' };
    if (__tape && __tape.open) return { ok: false, reason: 'recording' };
    if (t.noValues) return { ok: false, reason: 'tape-without-values' };
    __tape = { seed: (t.seed === undefined ? null : t.seed), entries: [], open: false,
      idx: 0, used: 0, miss: 0, lastMiss: null };
    // 只索引、不拷贝值：磁带是调用方的东西，本模块不持有第二份真源
    __tape.entries = t.entries;
    __mode = 'replay';
    return { ok: true, entries: __tape.entries.length,
      seed: __tape.seed, seedMatched: (__seedSource === 'none') ? null : (Number(__tape.seed) === __seed) };
  }
  /**
   * v2.89.0 O2：**从种子重算磁带**——纯函数，零副作用，不跑任何产品代码。
   *
   * 与 `replay()` 分工（两条证据答两个不同问题，缺一留缝）：
   *   · `replay()`   —— 同一段代码按磁带再走一遍，证「抽取序列对得上」；要重跑代码，
   *                     故**不能**用于会写世界的轮次；
   *   · `verifyTape()` —— 只做算术，证「这卷磁带确实出自这个种子」；对任何轮次都能用。
   *
   * 算法与录制路径逐字同构：逐通道 `hash32(种子 + ':' + 通道名)` 派生 mulberry32 流，
   *   按 entries 的**顺序**从各自通道取数——这正是录制时发生的事，故能逐值对齐。
   * 不一致只报**第一处**（第几格、哪个通道、期望值、实际值）：一处分歧之后所有值都会错位，
   *   把 200 处错位列出来反而藏住了「从哪儿开始错的」。
   */
  function verifyTape(t) {
    // v2.97.0 O10 自纠：坐标覆盖率面**先算**，四条早期返回全部把它带上。
    //   为什么必须这样：`no-seed`（未显式播种）是**最常见**的一条返回，而它此前
    //   连一个坐标字段都不带 ⇒ 调用方读 `orphanSlots` 得到 undefined，整条坐标读数静默失踪。
    //   「这卷磁带能不能定位到轮」与「这卷磁带出不出自这个种子」是两个独立的问题：
    //   后者答不了时，前者照样答得出来。
    //   另一处自纠（同一段）：原实现把「无坐标」判成 `!e.n` —— 而 `n` 是**位置真源**，
    //   每格必有 ⇒ `orphanSlots` 恒为 0，于是「这句话这次说不出口」永远说不出口。
    //   真正的判据是**语义坐标**（r / s）在不在。
    const coordHas = function (e) { return !!(e && ((e.r !== null && e.r !== undefined) || e.s)); };
    const coordFace = function (tt) {
      const es = (tt && Array.isArray(tt.entries)) ? tt.entries : [];
      return {
        withCoord: es.filter(coordHas).length,
        orphanSlots: es.filter(function (e) { return !coordHas(e); }).length,
        rounds: (function () {
          const seen = {};
          es.forEach(function (e) { if (e && e.r !== undefined && e.r !== null) seen[String(e.r)] = 1; });
          return Object.keys(seen).map(function (k) { return Number(k); }).sort(function (a, b) { return a - b; });
        })()
      };
    };
    const cf = coordFace(t);
    if (!t || !Array.isArray(t.entries)) return { ok: false, reason: 'bad-tape', withCoord: cf.withCoord, orphanSlots: cf.orphanSlots, rounds: cf.rounds };
    if (t.seed === null || t.seed === undefined) return { ok: false, reason: 'no-seed', withCoord: cf.withCoord, orphanSlots: cf.orphanSlots, rounds: cf.rounds };
    const n = Number(t.seed);
    if (!isFinite(n)) return { ok: false, reason: 'bad-seed', withCoord: cf.withCoord, orphanSlots: cf.orphanSlots, rounds: cf.rounds };
    const seedNum = (Math.floor(Math.abs(n)) % 0xFFFFFFFF) >>> 0 || 1;
    const streams = {};
    let checked = 0, mism = 0, first = null;
    t.entries.forEach(function (e, i) {
      const name = (e && e.c !== undefined && e.c !== null && e.c !== '') ? String(e.c) : 'default';
      if (!streams[name]) streams[name] = mulberry32(hash32(seedNum + ':' + name));
      const want = streams[name]();
      const got = Number(e && e.v);
      checked++;
      if (!(got === want)) {
        mism++;
        if (!first) first = { at: i, channel: name, want: want, got: (e ? e.v : null) };
      }
    });
    return {
      ok: mism === 0, reason: mism === 0 ? '' : 'value-mismatch',
      seed: seedNum, checked: checked, mismatches: mism, firstMismatch: first,
      channels: Object.keys(streams).sort(),
      // 位置面：磁带里 `k` 不是 'd'/'i' 的格（手改/旧版磁带）单独报，不混进值比对
      oddKinds: t.entries.filter(function (e) { return e && e.k !== 'd' && e.k !== 'i'; }).length,
      // v2.97.0 O10：坐标覆盖率（与早期返回**同一份**计算——两处各写一套迟早漂）。
      //   `orphanSlots` > 0 说明这卷磁带有一部分格**没有语义坐标**（旧版磁带，或录制时没人标记）
      //   ——它不是错误，但它决定「复核结论能定位到哪一层」：0 时可以指着「第几轮第几步」，
      //   >0 时只能说「第几格」。两句话不能混成一句。
      withCoord: cf.withCoord,
      orphanSlots: cf.orphanSlots,
      rounds: cf.rounds
    };
  }
  /** 退出回放。返回本次回放的走位读数（used / miss / 未走完多少格） */
  function stopReplay() {
    if (__mode !== 'replay') return { ok: false, reason: 'not-replaying' };
    const t = __tape || { idx: 0, used: 0, miss: 0, entries: [] };
    // v2.97.0 O10：走位读数按**语义坐标**分组。`byRound` 让「这一轮重放走了几步、
    //   在第几轮断掉」可读；`firstMissCoord` 是**未命中那一刻的坐标**
    //   （`lastMiss` 是最后一次；两者分列——第一次断点才是要找的那一处）。
    const byRound = {};
    t.entries.slice(0, t.idx).forEach(function (e) {
      const key = (e && e.r !== undefined && e.r !== null) ? String(e.r) : '(未标记)';
      byRound[key] = (byRound[key] || 0) + 1;
    });
    const out = { ok: true, used: t.used, miss: t.miss, consumed: t.idx,
      left: Math.max(0, t.entries.length - t.idx), lastMiss: t.lastMiss || null,
      byRound: byRound, rounds: Object.keys(byRound).length,
      // 断点坐标取**未命中那一刻**记下的那一份（t.firstMiss，由 take 在首次未命中时落笔）。
      //   自纠：本版首版这里写的是 `t.entries.filter(...)[0]` —— 无论断在哪都返回第 1 格，
      //   于是「第一次断在哪一轮哪一段」答出来的是「磁带从哪一格开始」（本版专锁当场抓出）。
      firstMissCoord: t.firstMiss || null };
    __mode = 'live';
    // 只丢走位用的索引卷；最近收卷的磁带留在 __lastTape（取证不得擦掉证据）
    __tape = null;
    return out;
  }

  // 观测
  function randStat() {
    const byCh = {};
    Object.keys(__stats.byChannel).forEach(function (k) { byCh[k] = __stats.byChannel[k]; });
    return {
      seed: __seed,
      seedSource: __seedSource,
      seedAt: __seedAt,
      reproducible: __seedSource === 'explicit',   // 只有显式播种才谈得上「可复现」
      draws: __stats.draws,
      ids: __stats.ids,
      reseeds: __stats.reseeds,
      failed: __stats.failed,
      failedBy: Object.assign({}, __stats.failedBy),
      channels: Object.keys(byCh).length,
      byChannel: byCh,
      channelNames: Object.keys(__streams).sort(),
      lastChannel: __stats.lastChannel,
      lastAt: __stats.lastAt,
      lastSeedAt: __stats.lastSeedAt
    };
  }
  function resetRandStat() {
    __stats.draws = 0; __stats.ids = 0; __stats.reseeds = 0;
    __stats.failed = 0; __stats.failedBy = {}; __stats.byChannel = {};
    __stats.lastAt = 0; __stats.lastChannel = null;
  }
  /** 已派生通道清单（「谁在用随机」的可枚举面） */
  function channels() { return Object.keys(__streams).sort(); }

  WA.rand = {
    // 决策流
    next: next,
    int: int,
    dice: dice,
    chance: chance,
    pick: pick,
    pickWeighted: pickWeighted,
    // 标识流
    id: id,
    // 种子
    seed: seed,
    reseed: reseed,
    getSeed: function () { ensureSeed(); return __seed; },
    seeded: function () { return __seedSource !== 'none'; },
    // 观测
    randStat: randStat,
    resetRandStat: resetRandStat,
    channels: channels,
    // v2.89.0 O2：抽取磁带（录制 / 收卷 / 只读视图 / 进入回放 / 退出回放）。
    //   回放侧读的是**答案与位置**，因此「调用顺序漂移」第一次可以被打出来，
    //   而不是安静地换一套数——本仓库此前对这种情况只有「不可判定」。
    beginTape: beginTape,
    endTape: endTape,
    tape: tapeInfo,
    replay: replay,
    stopReplay: stopReplay,
    // v2.97.0 O10：语义坐标（两个口，都有真实消费方）：
    //   · markCoord —— 打/还原坐标标记（消费方：causal.record / causal.replayWith
    //     —— 它们才知道「这一轮是第几轮、这一段叫什么」）
    //   · coordOf   —— 当前坐标只读（消费方：causal.evidence → 诊断 secCausal.coord 与面板）
    markCoord: markCoord,
    coordOf: coordOf,
    // v2.89.0 O2：从种子重算磁带（纯）。消费方：面板「复核磁带」与 tool-diag 的 secCausal
    //   —— 诊断侧只能调它，不能调 replay（replay 要重跑代码，而诊断必须零副作用）。
    verifyTape: verifyTape
  };
})();
