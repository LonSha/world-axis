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
      __seedSource = 'auto';
      __seedAt = Date.now();
      __stats.lastSeedAt = __seedAt;
    }
  }
  function tick(name) {
    __stats.draws++;
    __stats.byChannel[name] = (__stats.byChannel[name] || 0) + 1;
    __stats.lastChannel = name;
    __stats.lastAt = Date.now();
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
    return streamFor(name)();
  }
  /** 取一个 [0,1) 实数（决策流，计入 draws）。**唯一**的决策取数入口，其余都是它的规约。 */
  function next(ch) {
    const name = channelOf(ch);
    tick(name);
    return draw(name);
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
    return String(prefix || '') + Date.now().toString(36) + '_' + __uidCounter.toString(36) + (noise ? '_' + noise : '');
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
    __seedAt = Date.now();
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
    channels: channels
  };
})();
