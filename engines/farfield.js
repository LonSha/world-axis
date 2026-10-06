/**
 * WorldAxis engines/farfield.js (v2.151.0) — 远方世界脉搏（RX3）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   `horizon` 答「远方可能出事」（概率触发，玩家看着才触发）；
 *   `region` 答「远方的事件按世界钟追平」（谁在什么时候发生）。
 *   两者合起来仍然答不出第三件事：**「我不在的地方，此刻正在发生什么」**——
 *   远场没有自己的**状态**，它只是近场事件的一个来源。
 *   后果：玩家在城里坐着，世界地图上其他地方是**布景板**——不在那个窗口里，
 *   那些地方既不积累大势、也没有持续的火，只有一条条孤立的、等着被抽中的事件。
 *
 * ── 本模块落点（三件东西）────────────────────────────────────
 *   · tick(draft, opts) —— **远场脉搏**：按世界钟窗口，对每个已报备的远场地区
 *       用**确定性掷骰**推进一次简化大势（战事 / 商路 / 瘟疫 / 动荡 / 平静），
 *       产出「远方大事记」行。纯规则，**不消耗 AI**（不生成任何正文）。
 *   · 消息传播 —— 每次脉搏同时入一条**在途传闻**（`pending`），
 *       `dueAt = 发生时刻 + 距离/渠道算出的延迟`：**距离越远到得越晚**。
 *       到期由 `deliver()` 落地为「传来消息」，并在转述中**失真**
 *       （确定性截断 + 转述口吻），因为「原话」与「听说的」不是一回事。
 *   · 与远场痕迹联动 —— 战事/瘟疫类大事在脉冲上留 `sedimentPending` 标记，
 *       由显式入口 `settlePulse(id)` 把它写进 `WA.sediment`（地点痕迹）。
 *       **为什么不让 tick 直接写**：sediment.settle 自己开事务，在事务里再开事务
 *       就是嵌套事务（半提交风险）。故 tick 只挂号，落地是独立一步 —— 这两件事
 *       在读数上必须可分。
 *
 * ── 与 rumor / region / horizon 的分工（不许重叠）────────────
 *   · `horizon`  —— 近场可能被远方波及（**未发生**的概率面）；
 *   · `region`   —— 远方事件的发生与落地（**已发生**的事实面）；
 *   · `rumor`    —— 某人把某件**已知事实**传开（传播面，带跳数与失真）；
 *   · 本模块     —— 远场**自身的持续状态**（大势在积累什么）+ 它的消息在途。
 *     本模块**不抢 rumor 的活**：它只把到期的传闻交出去（`heard()`），
 *     `relayToRumor(id)` 显式转交，事实不存在时如实报 `unknown-fact`。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认**关闭**。关闭时 tick / deliver / settlePulse 一律拒收（`disabled`），
 *      `buildBlock()` 返回空串。
 *   2 **远场是简化的**：只记「大势」（`trend` 一行）与大事记，不记人名、不记逐条明细。
 *      细节只由既有的 `region.occur` 显式给 —— 本模块不替远方编具体的人与事。
 *   3 **确定性优先**：掷骰只由 `(地区, 窗口)` 决定。一次离线重放两次必须长出同一段远方历史。
 *   4 **不推近场**：`nearDays` 以内的地区归近场引擎（world / life / regional）——
 *      两处都管会让同一件事被推两遍，而「推了两遍」在读数上与「推进很快」长得一样。
 *   5 **受阻的消息不吞**：渠道受阻的地区整体跳过（记 `skipped`），
 *      在途传闻原地不动 —— 「那边没变」与「我们这边收不到」是两件事。
 *   6 **有界**：四个容器全部登记容量并走 `WA.evict` 单一出口。
 *   7 地区名与事件类型**一律显式**（表外值拒收并带 `allowed`）。
 *
 * ── v2.157.0（SP4 队列/预算/长局容量 + S2 远方自动生命周期）────────
 *   四类上限**分列声明**（此前它们挤在一个 `maxPulses` 上，读者分不清
 *   「一次推几窗」与「大事记环有多长」）：
 *     · 推演上限   `autoMaxWindows` —— 自动推进一次最多结几个窗口（防长离线爆批）；
 *     · 窗口预算   `maxPulses`     —— 窗口预算同时是大事记环长（同一把尺：窗口数即条目数）；
 *     · 在途容量   `capPending`    —— **满即暂停接收新批次并报告**，不再静默挤掉未到期的信；
 *     · 转移包容量 `capTransfer`   —— 一次转述包最多几条（整批判，不做部分交付）。
 *   三条纪律同 SP4 的验收条件：**预算削减保留未处理窗口**（`budget.carried`）／
 *   **封路不吞在途消息**（`deliver` 的 held 不动 deliveredAt）／**关闭时零写入**
 *   （`tick` / `deliver` / `auto` 三处都在 `disabled` 早退，不碰草稿）。
 *   S2 落点：`farfield.auto` 工作流节点（after order 37，紧跟 `region.offline`）——
 *   **以 SP1 的剧情时间（`playtime.story().dayIndex`）为唯一依据**换算成窗口时刻，
 *   调用本模块既有的 `tick` / `deliver`，与 `region.offline` 对齐时序但**分别记**
 *   大势（本模块）与明确事件（region）——两者不互相复制内容。默认关；首调只落基准。
 */

(function () {
  'use strict';
  // v2.151.0：别名形态用本仓规范式（module-cycle-gate 只认这一种形态）。
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_farfield_settings_v1';
  const DEF = {
    enabled: false,
    // v2.151.0 实测自纠：**取整数天**。设置总线的 `clampNum` 对声明区间内的数一律
    //   `Math.round`（全库同一处实现），故 0.5 天这种声明落盘后会变成 1 天 ——
    //   声明与生效不一致比少一个档位更坏（用户看到的不是引擎用的）。故本键以**整数天**为口径。
    nearDays: 1,        // 距本地几天以内算「近场」（≤ 此值归近场引擎，本模块不碰）
    maxPulses: 48,      // 远方大事记环
    capPending: 24,     // 在途传闻环
    capHeard: 32,       // 已传到近场环
    maxItems: 4,        // 注入块最多念几条
    spreadSalt: 7,      // 转述失真的盐（改它 = 换一套转述口径，故显式可配）
    // v2.157.0（SP4 + S2）：三个新旋钮。刻意**不与旧键复用**一个数字 ——
    //   「一次最多推几窗」「窗口预算」「在途能装几条」是三件事，共用一个值
    //   会让调其中一个时静默改掉另外两个（本仓反复治理的「一把旋钮两个语义」）。
    autoMaxWindows: 24, // 推演上限：自动推进一次最多结几个窗口
    capTransfer: 8,     // 转移包容量：一次转述包最多几条（整批判，不做部分交付）
    auto: false         // S2：按剧情时间自动推进（默认关——本模块写世界）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'farfield',
    bounds: { nearDays: [1, 30], maxPulses: [8, 192], capPending: [4, 96], capHeard: [4, 128],
      maxItems: [1, 12], spreadSalt: [0, 999],
      autoMaxWindows: [1, 192], capTransfer: [1, 32] } };

  // 远方大势的闭集。成表而不是自由文本：自造档位等于自造判定，下一手无法接手。
  const TRENDS = ['war', 'trade', 'plague', 'unrest', 'calm'];
  const TREND_LABEL = { war: '兵戈', trade: '商路', plague: '疫病', unrest: '动荡', calm: '平静' };
  // 渠道速度（天/天）：与 region 的 LANES 同口径但**不共用常量**——region 的 lane 是
  //   「一条路走多快」，这里是「这股消息以多快渗进近场」，两者会独立演化。
  const LANE_SPEED = { road: 1, sea: 0.5, bird: 3 };
  const MS_PER_DAY = 86400000;

  const stat = { ticks: 0, pulses: 0, pending: 0, delivered: 0, distorted: 0, skipped: 0,
    settled: 0, relays: 0, lastReason: '', faults: {}, byTrend: {},
    // v2.157.0（SP4 + S2）：四类新读数。每一个都能**单独**抓到一个现场，
    //   合写会让处置不同的局面在读数上同形：
    //     · carriedOnce —— 有过几次「有窗口没推完」（预算不足的现场，不是平静）；
    //     · pendingFull —— 在途满而**暂停接收**过几次（容量裁决现场）；
    //     · transfers   —— 打包过几次（读侧转移面的消费现场）；
    //     · autoTicks / autoFirsts —— 自动推进真跑过几次 / 其中几次只落基准。
    //   **必须在这里声明**：它们不入这一行，`stat.x++` 会写成 NaN / undefined，
    //   而 NaN 在面板与诊断上看起来像「这个读数没实现」——恰恰是静默失效。
    carriedOnce: 0, pendingFull: 0, transfers: 0, autoTicks: 0, autoFirsts: 0 };

  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function num(v) {
    // v2.151.0 实测自纠：`null` 必须返 null。Number(null) === 0，而 0 是一个合法时刻（Unix 纪元）——
    //   把它当真值会让「没有基准点」这条边界映射成「你走了一百万小时」
    //   （首调直接算出一次天翻地覆的离线），而这个错误在读数上与正常推进长得一样。
    //   空串 / 非数字字符串同理：不是时刻就不是时刻。
    const n = (v === null || v === undefined || v === '') ? NaN : Number(v);
    return isFinite(n) ? n : null;
  }
  // v2.156.0：时间源守卫与全仓同形（G20 只认这一种：守卫与 fallback 同行共现）。
  const clockNow = function (site) { try { return WA.clock.now(site || 'farfield'); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  /** v2.151.0：设置写口（面板总开关 + 两个旋钮的真消费方）。形态与 sediment 同规格。 */
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function bucket(draft) {
    if (!draft.farfield || typeof draft.farfield !== 'object' || Array.isArray(draft.farfield)) {
      draft.farfield = { pulses: [], pending: [], heard: [], lastTickAt: null, rounds: 0 };
      // v2.157.0（S2）：自动推演游标与成本留痕也在同一骨架里物化 ——
      //   登记了却不在骨架里，registryParity 会报「未在骨架物化」。
      draft.farfield.autoDay = null;
      draft.farfield.autoAt = null;
      draft.farfield.autoReason = '';
    }
    const b = draft.farfield;
    if (!Array.isArray(b.pulses)) b.pulses = [];
    if (!Array.isArray(b.pending)) b.pending = [];
    if (!Array.isArray(b.heard)) b.heard = [];
    if (b.lastTickAt === undefined) b.lastTickAt = null;
    if (b.autoDay === undefined) b.autoDay = null;   // S2：上次自动推进到哪个剧情日
    if (b.autoAt === undefined) b.autoAt = null;     // 那一日的实际推进时刻（重放可分）
    if (b.autoReason === undefined) b.autoReason = '';
    return b;
  }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function rowsOf(k) { const f = state().farfield; return (f && Array.isArray(f[k])) ? f[k] : []; }

  /**
   * 远方分区：读 `WA.region.places()`（**远方地区的单一真源**），按距离切近/远。
   *   为什么不在本模块另存一份地区表：那正是第二真源 —— region 改了距离或渠道，
   *   本模块会拿着一份旧表继续算延迟（而读数上看不出是旧的）。
   */
  function partition() {
    const cfg = settings();
    let ps = [];
    try { ps = (WA.region && typeof WA.region.places === 'function') ? (WA.region.places() || []) : []; } catch (e) { ps = []; }
    const near = [], far = [];
    ps.forEach(function (p) {
      if (!p || !p.name) return;
      const d = num(p.distanceDays);
      if (d === null) return;
      (d <= cfg.nearDays ? near : far).push(p);
    });
    return { near: near, far: far, nearDays: cfg.nearDays, known: ps.length };
  }

  /** 确定性掷骰：同一 `(地区, 窗口, 盐)` 恒得同一值（FNV-1a）。与 region.rollOffline 同法不同表。 */
  function roll(name, win, salt) {
    const s = String(name) + '|' + String(win) + '|' + String(salt);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h / 4294967296;
  }
  /** 一个窗口里远方自行发生的概率（如实写死，不做旋钮 —— 与 region 的 OFFLINE_CHANCE 同口径）。 */
  const PULSE_CHANCE = 0.5;

  /**
   * 远方脉搏。**必须在事务里调用**（与 `region.tickOffline` 同规格）——
   *   本函数改的是 `draft.farfield`，自己不开事务。
   * @param {object} draft
   * @param {{now?:number, rounds?:number}} [opts]
   */
  function tick(draft, opts) {
    // 关闭时**零写入**：连 bucket() 都不调（它会在草稿上造容器 —— 那就是写）。
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', wrote: false }; }
    const o = opts || {};
    if (!draft || typeof draft !== 'object') { noteFault('no-draft'); return { ok: false, reason: 'no-draft' }; }
    const cfg = settings();
    const now = num(o.now) === null ? clockNow('farfield') : num(o.now);
    const b = bucket(draft);
    const last = num(b.lastTickAt);
    // 没有基准点：只落基准。第一次告诉你「从这里起算」，不回头猜。
    if (last === null) {
      b.lastTickAt = now;
      stat.lastReason = 'first';
      return { ok: true, first: true, from: now, to: now, windows: 0, pulses: [], skipped: [] };
    }
    const part = partition();
    if (now <= last) {
      return { ok: true, first: false, from: last, to: now, windows: 0, pulses: [], skipped: [], reason: 'no-elapsed' };
    }
    if (!part.far.length) {
      b.lastTickAt = now;
      stat.lastReason = 'no-far';
      return { ok: true, first: false, from: last, to: now, windows: 0, pulses: [], skipped: [],
        reason: 'no-far', nearCount: part.near.length, knownCount: part.known };
    }
    const requested = num(o.rounds);
    const win0 = Math.floor(last / MS_PER_DAY);
    const win1 = Math.floor(now / MS_PER_DAY);
    const span = Math.max(0, win1 - win0);
    if (!span) {
      return { ok: true, first: false, from: last, to: now, windows: 0, pulses: [], skipped: [], reason: 'too-short' };
    }
    // 窗口数是**时长决定的上限**，`rounds` 只能把它压小 —— 不能凭空放大
    //   （放大 = 同一段时长里推两遍，读数上会变成「远方自己加速了」）。
    const windows = requested === null ? Math.min(span, cfg.maxPulses)
      : Math.max(0, Math.min(span, cfg.maxPulses, Math.floor(requested)));
    if (!windows) {
      return { ok: true, first: false, from: last, to: now, windows: 0, pulses: [], skipped: [], reason: 'too-short' };
    }
    const made = [], skipped = [];
    part.far.forEach(function (p) {
      // ⑤ 受阻的地区整体跳过：消息过不来，远方的事不在本模块呈现。
      if (p.blocked) { skipped.push({ place: p.name, why: 'blocked' }); return; }
      for (let w = win0 + 1; w <= win0 + windows; w++) {
        const id = 'ff_' + p.name + '_' + w;
        if (b.pulses.some(function (r) { return r && r.id === id; })) continue;
        if (roll(p.name, w, cfg.spreadSalt) >= PULSE_CHANCE) continue;
        const kind = TRENDS[Math.floor(roll(p.name, w, 31) * TRENDS.length) % TRENDS.length];
        if (b.pulses.length >= cfg.maxPulses) { skipped.push({ place: p.name, why: 'pulses-full' }); break; }
        // v2.157.0（SP4）：在途满 ⇒ **暂停接收新批次**并把原因报出来。
        //   为什么不沿用「挤出最旧者」：在途的是一条**尚未抵达**的信，挤掉它
        //   等于「你这边收不到」与「那边没发生」在读数上变成同一件事。
        //   暂停是**有据的**：`skipped` 里逐地区写明 why，下一次预算仍从本窗口续上
        //   （`b.lastTickAt` 不被推进），不会丢窗口。
        if (b.pending.length >= cfg.capPending) { stat.pendingFull++; skipped.push({ place: p.name, why: 'pending-full' }); break; }
        const lane = LANE_SPEED[p.lane] ? p.lane : 'road';
        const delayDays = Math.max(0.25, (num(p.distanceDays) || 1) / LANE_SPEED[lane]);
        const at = w * MS_PER_DAY;
        const row = { id: id, place: p.name, trend: kind,
          label: TREND_LABEL[kind], window: w, at: at, lane: lane, distanceDays: num(p.distanceDays) || 0,
          // 与 sediment 联动的挂号位：**不让 tick 直接写**（嵌套事务）。
          sedimentPending: (kind === 'war' || kind === 'plague') };
        b.pulses.push(row);
        WA.evict.array(b.pulses, 'farfield.pulses', cfg.maxPulses);
        // 在途传闻：到期时刻 = 发生 + 距离/渠道算出的延迟 ⇒ **距离越远到得越晚**。
        b.pending.push({ id: row.id, place: p.name, trend: kind, at: at, window: w,
          dueAt: at + delayDays * MS_PER_DAY, delayDays: delayDays, deliveredAt: 0 });
        // v2.157.0（SP4）：上面那道闸已保证不超限，故这行 evict 是**兜底**
        //   （在闸生效的前提下不可达）。保留它而不是删掉：闸是「业务裁决」，
        //   这行是「再糟也不撑爆存档」——把两者合成一个让「闸坏了」与「闸生效」
        //   在读数上同形，而本站点正是容量的单一真源（evict 台账按站点记挤出）。
        WA.evict.array(b.pending, 'farfield.pending', cfg.capPending);
        made.push(row);
        stat.byTrend[kind] = (stat.byTrend[kind] || 0) + 1;
      }
    });
    // A reduced budget leaves the remaining completed windows for the next tick.
    b.lastTickAt = windows < span ? (win0 + windows) * MS_PER_DAY : now;
    b.rounds = (b.rounds || 0) + windows;
    stat.ticks++; stat.pulses += made.length; stat.pending += made.length; stat.skipped += skipped.length;
    stat.lastReason = made.length ? 'pulsed' : 'quiet';
    // v2.157.0（SP4）：预算裁决的**显式读数**。`carried` = 这一段时长里
    //   还没处理的完整窗口数 —— 它与 `windows` 分开报，因为「推了 2 窗」
    //   与「还剩 5 窗没推」是两件事，合写一个数会让削减预算看起来像「远方很平静」。
    const carried = Math.max(0, span - windows);
    if (carried) stat.carriedOnce++;
    return { ok: true, first: false, from: last, to: now, windows: windows,
      pulses: made, skipped: skipped, farCount: part.far.length,
      budget: { span: span, used: windows, carried: carried, cap: cfg.maxPulses } };
  }

  /**
   * v2.157.0（S2）远方自动生命周期 —— **以剧情时间为唯一依据**。
   *
   * 为什么要单独一口而不是让调用方自己凑 `now`：`tick` 收的是毫秒时刻，
   *   而「剧情走到第几天」是 `playtime.story().dayIndex`。两者之间的换算只能有一份，
   *   放在调用方就是每个宿主自己凑一次 —— 凑错不会报错，只会静默少推或多推几窗。
   *
   * 四条与 S2 验收条件一一对应的纪律：
   *   ① **不额外推进日窗**：窗口数由「剧情日推进了几日」决定，再受推演上限
   *      `autoMaxWindows` 封顶；调用方不能传一个更大的数把它放大。
   *   ② **零时间 / 倒退 / 重放不追加未来脉搏**：`day <= autoDay` 一窗也不推
   *      （`no-elapsed` 与 `backward` 分列）—— 与 `tick` 的 `no-elapsed` 同纪律。
   *   ③ **首调只落起点**：`autoDay === null` 时只把当前剧情日落下，不凭空补写此前历史。
   *   ④ **预算不足保留余量**：游标只前移到**真处理过的那一窗**，下一次从尚未完成的续上。
   *
   * 与 `region.offline` 的关系：两者挂在同一条 after 链的相邻序号上（本模块 37，
   *   region 36），**时序对齐而内容不复制** —— region 记「谁的什么事发生在何时」，
   *   本模块记「远方自己在积累什么大势」。合并两者会让「大势」与「事件」在读数上同形。
   *
   * @param {object} draft 事务草稿（与 tick 同规格：**必须在事务里调用**）
   * @param {{day?:number}} [opts] 显式剧情日（不传则现取 playtime.story()）
   */
  function auto(draft, opts) {
    const started = clockWall();
    const cfg = settings();
    // 关闭时**零写入**：连 bucket() 都不调（它会在草稿上造容器 —— 那就是写）。
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', wrote: false }; }
    if (!cfg.auto) { noteFault('auto-off'); return { ok: false, reason: 'auto-off', wrote: false }; }
    const o = opts || {};
    if (!draft || typeof draft !== 'object') { noteFault('no-draft'); return { ok: false, reason: 'no-draft', wrote: false }; }
    // 剧情时间：不传就现取；**两种路径都必须真有一个已设定的世界钟** ——
    //   否则「第 0 日」会被当成一个真实时刻，而它其实是「还没定日子」。
    let day = num(o.day);
    let st = null;
    try { st = (WA.playtime && typeof WA.playtime.story === 'function') ? WA.playtime.story() : null; } catch (e) { st = null; }
    if (!st || st.ok !== true) { noteFault('no-clock'); return { ok: false, reason: 'no-clock', wrote: false }; }
    if (day === null) day = num(st.dayIndex);
    day = (day === null) ? NaN : Math.floor(day);
    if (!(day > 0)) { noteFault('no-clock'); return { ok: false, reason: 'no-clock', wrote: false }; }
    const b = bucket(draft);
    const lastDay = num(b.autoDay);
    if (lastDay === null) {
      b.autoDay = day; b.autoAt = clockWall(); b.autoReason = 'first';
      // 同时把 tick 的基准落下（rounds:0 ⇒ 一窗也不推）：**首调只落起点**必须
      //   连窗基准一起落，否则下一步的 span 会从「完全没有基准」起算，`tick` 的第
      //   一次调用又把基准重落一遍 —— 于是每一步都「只落基准」，一窗也推不动，
      //   而读数上（windows:0 / first:false）看起来像「剧情日没动」。
      try { tick(draft, { now: day * MS_PER_DAY + MS_PER_DAY - 1, rounds: 0 }); } catch (e) {}
      stat.autoFirsts++; stat.lastReason = 'auto-first';
      return { ok: true, first: true, day: day, from: day, stepDays: 0, windows: 0, delivered: 0, wrote: true };
    }
    const stepDays = day - lastDay;
    if (stepDays <= 0) {
      stat.lastReason = stepDays === 0 ? 'auto-no-elapsed' : 'auto-backward';
      return { ok: true, first: false, day: day, from: lastDay, stepDays: stepDays,
        windows: 0, delivered: 0, wrote: false,
        reason: stepDays === 0 ? 'no-elapsed' : 'backward' };
    }
    // 窗口时刻取该日**末尾**：`tick` 按 `floor(ms / MS_PER_DAY)` 切窗，
    //   传到日首会让「今天这一步」落进昨天那一窗（少推一窗而读数上看不出）。
    const nowMs = day * MS_PER_DAY + MS_PER_DAY - 1;
    const rounds = Math.min(stepDays, cfg.autoMaxWindows);
    const t = tick(draft, { now: nowMs, rounds: rounds });
    if (!t || t.ok !== true) {
      stat.lastReason = 'auto-tick-failed';
      return { ok: false, reason: (t && t.reason) || 'tick-failed', wrote: false, day: day };
    }
    // 游标只前移到**真处理过的那一窗**（预算不足时保留余量，下一次续上）。
    const frontier = num(b.lastTickAt);
    const reached = frontier === null ? lastDay : Math.floor(frontier / MS_PER_DAY);
    const d2 = deliver(draft, { now: nowMs });
    b.autoDay = Math.max(lastDay, Math.min(day, reached));
    b.autoAt = clockWall();
    b.autoReason = (t.budget && t.budget.carried) ? 'carried' : 'ok';
    stat.autoTicks++;
    stat.lastReason = 'auto' + (b.autoReason === 'carried' ? '-carried' : '');
    const out = { ok: true, first: false, day: day, from: lastDay, stepDays: stepDays,
      to: b.autoDay, windows: t.windows || 0, pulses: (t.pulses || []).length,
      delivered: (d2 && d2.delivered) || 0, held: (d2 && d2.blocked) || 0,
      budget: t.budget || null, wrote: true };
    // 接入现有性能台账（RP1）：与 inject-value / eco-audit 同规格 ——
    //   只进**内存**台账，不落盘、不开事务（观测不污染被观测者）。
    try {
      if (WA.perfLedger && typeof WA.perfLedger.ingest === 'function') {
        const ms = Math.max(0, clockWall() - started);
        WA.perfLedger.ingest({ '远场自动推进': { ms: ms, n: 1 } });
      }
    } catch (e) {}
    return out;
  }

  /**
   * v2.157.0（SP4）转移包 —— 一次转述包**整批交付或整批拒收**。
   *   为什么不做部分交付：把「8 条里给你 4 条」拼进正文，读者读到的是一段
   *   看起来完整的转述，而它实际上缺了一半 —— 「转移包被截断」在读数上与
   *   「这就是全部」完全同形。故超出 `capTransfer` 时报 `too-many` 并带出上限。
   */
  function transferPack(opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const want = num(o.max);
    const rows = rowsOf('heard');
    const n = want === null ? rows.length : Math.max(0, Math.floor(want));
    if (n > cfg.capTransfer) {
      noteFault('too-many');
      return { ok: false, reason: 'too-many', wanted: n, cap: cfg.capTransfer };
    }
    const picked = rows.slice(-n).map(function (r) {
      return { id: r.id, place: r.place, trend: r.trend, said: r.said, at: r.at,
        deliveredAt: r.deliveredAt, distorted: !!r.distorted, delayDays: r.delayDays };
    });
    stat.transfers++; stat.lastReason = 'transferred';
    return { ok: true, count: picked.length, cap: cfg.capTransfer, rows: picked,
      // 明确：包内只有**已传到近场**的消息；在途的一条都不进包。
      inFlight: rowsOf('pending').filter(function (m) { return m && !m.deliveredAt; }).length };
  }

  /**
   * 转述失真：**确定性**地把一件远方大事说变形。
   *   为什么必须有它：传闻的本质是「经了几手」，一成不变的转述等于把远方大事
   *   原封不动搬进近场 —— 那读者会误以为那是亲见。失真是**算出来的**（同输入同结果），
   *   不是随机涂改（随机 = 不可复现 = 下次重放那段历史会变）。
   */
  function spread(text, place, win, salt) {
    const r = roll(place, win, salt);
    const t = String(text || '');
    const keep = Math.max(2, Math.ceil(t.length * (0.5 + 0.4 * r)));
    return t.slice(0, keep) + (keep < t.length ? '…' : '');
  }

  /**
   * 落地未到期的传闻（到期者转「传来消息」，未到期的一律留下）。
   *   在途守则：**未到期不许提前落地**（与 region.deliver 的 `too-early` 同纪律）——
   *   提前落地等于把距离抹平，而「距离被抹平」在读数上与「消息很快」长得一样。
   */
  function deliver(draft, opts) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    if (!draft || typeof draft !== 'object') { noteFault('no-draft'); return { ok: false, reason: 'no-draft' }; }
    const cfg = settings();
    const now = num(o.now) === null ? clockNow('farfield') : num(o.now);
    const b = bucket(draft);
    const out = [], early = [];
    const part = partition();
    const blocked = part.near.concat(part.far).filter(function (p) { return p.blocked; }).map(function (p) { return p.name; });
    const held = [];
    b.pending.forEach(function (m) {
      if (!m || m.deliveredAt) return;
      if (blocked.indexOf(m.place) >= 0) { held.push(m.id); return; }
      if (now < m.dueAt) { early.push({ id: m.id, waitMs: m.dueAt - now }); return; }
      m.deliveredAt = now;
      const raw = m.place + '：' + (TREND_LABEL[m.trend] || m.trend);
      const said = spread(raw, m.place, m.window, cfg.spreadSalt);
      const row = { id: m.id, place: m.place, trend: m.trend, at: m.at, deliveredAt: now,
        delayDays: m.delayDays, said: said, distorted: said !== raw, source: 'farfield' };
      b.heard.push(row);
      WA.evict.array(b.heard, 'farfield.heard', cfg.capHeard);
      out.push(row);
      if (row.distorted) stat.distorted++;
    });
    stat.delivered += out.length;
    stat.lastReason = out.length ? 'delivered' : (early.length ? 'too-early' : 'nothing-pending');
    return { ok: true, delivered: out.length, rows: out, early: early.length, blocked: held.length,
      reason: out.length ? undefined : (early.length ? 'too-early' : 'nothing-pending') };
  }

  /** 已传到近场的远方消息（**只读到期的**）。`filter.place` 可选。 */
  function heard(opts) {
    const o = opts || {};
    const want = clean(o.place, 40);
    const list = rowsOf('heard').filter(function (r) { return r && (!want || r.place === want); });
    return { ok: true, count: list.length, rows: list.map(function (r) {
      return { id: r.id, place: r.place, trend: r.trend, said: r.said, at: r.at,
        deliveredAt: r.deliveredAt, distorted: !!r.distorted, delayDays: r.delayDays };
    }) };
  }
  /** 在途传闻（只读）。未到期的**必须**在这里看得见 —— 「在路上」不是「没发生」。 */
  function pending() {
    const list = rowsOf('pending').filter(function (m) { return m && !m.deliveredAt; });
    return { ok: true, count: list.length, rows: list.map(function (m) {
      return { id: m.id, place: m.place, trend: m.trend, at: m.at, dueAt: m.dueAt, delayDays: m.delayDays };
    }) };
  }

  /**
   * 把远方大事写成**地点痕迹**（与 `WA.sediment` 联动）。
   *   为什么是独立入口而不是 tick 里顺手写：`sediment.settle` 自己开事务，
   *   在事务里再开事务就是嵌套事务（半提交风险）。挂号（`sedimentPending`）与
   *   落地（本函数）分开，两者在读数上可分。
   */
  function settlePulse(id) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const k = clean(id, 60);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'id' }; }
    const row = rowsOf('pulses').filter(function (p) { return p && p.id === k; })[0] || null;
    if (!row) { noteFault('unknown-pulse'); return { ok: false, reason: 'unknown-pulse', id: k }; }
    if (!WA.sediment || typeof WA.sediment.settle !== 'function') { noteFault('sediment-absent'); return { ok: false, reason: 'sediment-absent' }; }
    const trace = row.trend === 'war' ? 'scar' : (row.trend === 'plague' ? 'marked' : 'minor');
    const r = WA.sediment.settle(row.place, { key: 'farfield:' + row.id, text: (row.label || row.trend) + '（远方）', trace: trace, at: row.at });
    if (r && r.ok) stat.settled++; else if (r) noteFault(r.reason || 'settle-failed');
    return r;
  }

  /**
   * 把一条已到期的远方消息**显式**交给 rumor 链（跨模块传播面）。
   *   为什么不是自动转交：rumor 的链必须挂在**已存在的事实键**上（`unknown-fact` 是硬拒收）。
   *   自动转交会在事实缺席时静默失败，或更糟——替世界编一个事实键出来。
   *   故这里如实报 `unknown-fact`，由调用方先落事实再转交。
   */
  function relayToRumor(id, opts) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const k = clean(id, 60);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'id' }; }
    const row = rowsOf('heard').filter(function (r) { return r && r.id === k; })[0] || null;
    if (!row) { noteFault('unknown-message'); return { ok: false, reason: 'unknown-message', id: k }; }
    if (!WA.rumor || typeof WA.rumor.startChain !== 'function') { noteFault('rumor-absent'); return { ok: false, reason: 'rumor-absent' }; }
    const o = opts || {};
    const factKey = clean(o.factKey, 80);
    if (!factKey) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'factKey' }; }
    const r = WA.rumor.startChain(factKey, '远方传闻（' + row.place + '）');
    if (r && r.ok) stat.relays++; else if (r) noteFault(r.reason || 'relay-failed');
    return r;
  }

  /**
   * 注入块。关闭或无内容时**返回空串**（不给老用户凭空多出约束）。
   *   只念**已传到近场**的消息，在途的一条都不念 —— 「还在路上」写进正文
   *   就等于把延迟抹平（读者会以为已经听说了）。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const h = heard();
    if (!h.count) return '';
    const part = partition();
    const rows = h.rows.slice(-cfg.maxItems);
    stat.blocks = (stat.blocks || 0) + 1;
    return '[远方的脉搏]' + String.fromCharCode(10)
      + '近处之外还有别的地方在动（以下都是听来的，不是亲眼所见，且多半已经走了样）：' + String.fromCharCode(10)
      + rows.map(function (r) {
        return '- ' + r.said + '（' + (r.distorted ? '转述已失真' : '原话') + '）';
      }).join(String.fromCharCode(10))
      + String.fromCharCode(10) + '近场（' + part.near.length + ' 处）的动向不在此列，由眼前的世界自行呈现。';
  }

  function statOf() {
    const cfg = settings();
    const p = rowsOf('pending').filter(function (m) { return m && !m.deliveredAt; }).length;
    const part = partition();
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      byTrend: Object.assign({}, stat.byTrend),
      enabled: !!cfg.enabled,
      pulses: rowsOf('pulses').length,
      pendingInFlight: p,
      heard: rowsOf('heard').length,
      nearCount: part.near.length,
      farCount: part.far.length,
      autoDay: null, autoAt: null, autoReason: '',
      caps: { pulses: cfg.maxPulses, pending: cfg.capPending, heard: cfg.capHeard,
        windowsBudget: cfg.maxPulses, autoMaxWindows: cfg.autoMaxWindows,
        transfer: cfg.capTransfer },
      autoOn: !!cfg.auto
    });
  }

  WA.farfield = {
    TRENDS: TRENDS.slice(),
    TREND_LABEL: Object.assign({}, TREND_LABEL),
    LANE_SPEED: Object.assign({}, LANE_SPEED),
    getSettings: settings,
    setSettings: saveSettings,
    partition: partition,
    tick: tick,
    deliver: deliver,
    heard: heard,
    pending: pending,
    auto: auto,
    transferPack: transferPack,
    settlePulse: settlePulse,
    relayToRumor: relayToRumor,
    buildBlock: buildBlock,
    stat: statOf
  };
  // ── S2 工作流节点（一个，critical: false —— 与 region.offline 同规格）────
  //   位置：after 链 order 37，**紧跟 region.offline（36）之后**。
  //   为什么必须紧邻：两者都以 SP1 的剧情时间为依据推进远方，先记大势（本模块）
  //   再记明确事件（region）——反过来会让 region 新记的事件在同一轮就被本模块
  //   当成「大势」念出去，而它其实还没在近场落地。
  //   为什么 critical: false：附属面的失败不是主链的失败（与 bridge.publish /
  //   region.offline / offlineReturn.* 同规格）。
  try {
    if (WA.workflow && typeof WA.workflow.register === 'function') {
      WA.workflow.register({
        id: 'farfield.auto', chain: 'after', order: 37, critical: false,
        label: '远方自动生命周期（按剧情时间积累大势、到期落地）',
        async run() {
          try {
            if (!WA.farfield || typeof WA.farfield.auto !== 'function') return;
            const cfg = WA.farfield.getSettings();
            if (!cfg.enabled || !cfg.auto) return;   // 两个门都关时零开销早退（不白开一次事务）
            WA.store.transact(function (draft) { WA.farfield.auto(draft, {}); }, 'farfield:auto');
          } catch (e) { /* 附属面失败不拖主链（与 bridge.publish 同规格） */ }
        }
      });
    }
  } catch (e) { /* 无工作流环境（纯单测）不阻断模块本体 */ }

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/farfield.js', { kind: 'engine', ver: '2.157.0' });
})();