/**
 * WorldAxis engines/life.js (v2.52.0)
 * 人物生活：持续目标、关系承诺、基础日程、条件式行动。
 *
 * 设计边界：
 *   1 总开关默认关闭。关闭时不结算、不注入，也不凭空补写人物履历。
 *   2 状态挂在 people.<id>.life，绑定稳定人物 id，不使用姓名槽或模块内存。
 *   3 只推进已有依据：人物已有目标、承诺、日程，或调用方显式传入事实。
 *   4 条件不足时选择等待，不把每轮都必须行动伪装成自主性。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };
  const LS_KEY = 'worldaxis_life_settings_v1';
  const DEF = { enabled: false, maxPeople: 4, maxItems: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'life', bounds: { maxPeople: [1, 8], maxItems: [1, 4] } };
  const COMMITMENTS = ['promise', 'debt', 'secret', 'cooperation', 'boundary'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v2.156.0（SP2 承重结构）：`stat` 由 const 改为 let —— 试演期（离线批）在**影子袋**上
  //   跑同一段结算逻辑时，stat 整体临时重指向袋内副本（见 tickDraft / makeBag 注释）。
  //   为什么不是「逐字段重定向」：BODY 里对 stat 的写是**字面** `stat.fairRounds++` 这类
  //   表达式（多个既有锁的锚点逐字钉住它们），替换成 bag.fairRounds 会破坏那些锚点。
  //   整体重指向让字面原样保留，语义由「当前 stat 指向谁」决定，退出时无条件还原。
  let stat = { ticks: 0, changed: 0, blocked: 0, lastAt: 0, lastReason: '',
    // v2.85.0 B1：两个「本可以推演却没推演」的原因必须分开计数——
    //   名额不足（skipped）与协作未被回应（unreciprocated）是两件事：
    //   前者是资源约束，后者是**依据不足**。合成一个数就再也答不出该加名额还是该等对方。
    skipped: 0, unreciprocated: 0,
    // v2.139.0（E8）：**二阶公平**的两个留痕位。
    //   E4（v2.115.0）治的是「同一组里总有个人排在后面」——它把静态定序换成环形轮转，
    //   但环上的位置一旦定下就**永远不变**：同一组里「谁总排前面」仍然固定，
    //   长期看依旧是位置决定命运，只是换了种排法。
    //   本版把组内定序交还随机源（加权：依据多者概率大），于是「谁排前面」每轮都可能不同，
    //   且**长期频率**第一次成了可被读数检验的东西（固定序做不到这一点）。
    //   fairRounds 与 fairThrows 必须分开记：一个答「这套机制到底在不在跑」，
    //   一个答「它有没有在背后静默降级」——合成一个数就再也答不出是哪一种。
    fairRounds: 0, fairThrows: 0 };
  // v2.115.0（规划 01 的 E4）：**同等依据者的轮转游标**。
  //   为什么必须有它：静态排序 + 截断 ⇒ 同等依据的后段人物每一轮都被跳过，
  //   而 `skipped` 只答「这一轮少推了几个人」，答不出「谁总也没轮到」。
  // v2.132.0（O19 跨会话游标）：**游标从进程态升级为盘上态**。
  //   v2.115.0 → v2.131.1 的四版留档里，这条缺口逐字重复出现在「未覆盖」清单：
  //   「`_turn` 是**进程态**，跨会话不延续」——它治的是**跨轮**的不公平，
  //   而**跨会话**时每载入一次模块就归零：一个会话只跑一轮的长局里，
  //   游标恒为 0 ⇒ 「谁总也没轮到」退回到 v2.115.0 之前那句话（位置决定命运）。
  //   为什么会这样：`let` 初值只在求值期跑一次，而本模块的求值**每个会话都发生一次**。
  //   故「跨轮」这件事此前只在**同一进程内的多次 tick** 里成立。
  let _turn = 0;
  // 单真源：一个键、一个结构 `{ chatId, turn }`。落盘走 localStorage（与 chatcache / worldbook 同口径）。
  //   为什么**不**落进世界存档（v2.115.0 的原始口径「不落存档」继续成立）：
  //   游标记的是「这一轮从谁开始」，不是世界事实；进存档会让它变成一份会过期的第二真源
  //   （导出/导入世界会连「上次从谁开始」一起搬走，而那是**进程的**记忆，不是世界的）。
  const TURN_KEY = 'worldaxis_life_turn_v1';
  // **开关门**：它是这次升级的**原子交换点**，也是老口径的逃生舱。
  //   关闭（默认）⇒ 逐字退回 v2.115.0：`_turn` 是进程态、永不落盘、永不读盘。
  //   打开 ⇒ 载入时读回、tick 后写盘。一盏灯管两件事（读与写），不存在「只读不写」的半开状态。
  const TURN_DEF = { crossSession: false };
  const TURN_REG = { key: 'worldaxis_life_settings_v1', def: TURN_DEF, module: 'life' };
  function turnCfg() {
    // 复用主设置键的读路径（**不**注册第二个键：本模块的设置键只有 `LS_KEY` 一个，
    //   另开一键会让「设置归属」类判据读到两个来源）。
    const raw = WA.settingsBus ? WA.settingsBus.read(TURN_REG) : TURN_DEF;
    const v = raw && raw.crossSession;
    // 老口径是布尔声明：手改盘面 / 旧版写入可能产出 "true" 这类字符串，此处显式收窄成布尔。
    return v === true;
  }
  function win() { return WA.mainWin || (typeof window !== 'undefined' ? window : null); }
  // 裸读归因（与 chatcache / worldbook / checkpoints 同一条出口）：
  //   「读不出来」最坏的形态不是抛错，而是**被当成「没有这回事」**——
  //   游标读不出来时我们答的是「本会话从 0 开始」，这与「真的从 0 开始」同形。
  //   投递 `store.reportReadFail` 是让那件事在诊断里留下痕迹的唯一出口（G16 门禁冻结此清单）。
  function noteRead(source, key, err) {
    try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail(source, key, err); } catch (e) {}
  }
  function curChatId() {
    // 与 core/store 同源（同机多聊天各有一份世界，游标也各归各的）。
    try { return WA.store && WA.store.chatId ? String(WA.store.chatId()) : 'wa_default'; } catch (e) { return 'wa_default'; }
  }
  function turnLoad() {
    if (!turnCfg()) return null;
    const w = win(); if (!w || !w.localStorage) return null;
    let row = null;
    try { row = JSON.parse(w.localStorage.getItem(TURN_KEY) || 'null'); }
    catch (e) { noteRead('lifeTurn', TURN_KEY, e); row = null; }
    // **不得回落**：文件在、但是本聊天的、结构对 ⇒ 才认。认不出就如实答「不知道」，
    //   而不是悄悄从 0 开始（后者会让「跨会话延续」这件事在读数上无法与「归零」分辨）。
    if (!row || typeof row !== 'object' || row.chatId !== curChatId()) return null;
    const n = Number(row.turn);
    return isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }
  function turnStore() {
    if (!turnCfg()) return { ok: false, reason: 'disabled' };
    const w = win(); if (!w || !w.localStorage) return { ok: false, reason: 'no-localStorage' };
    try {
      w.localStorage.setItem(TURN_KEY, JSON.stringify({ chatId: curChatId(), turn: _turn }));
      return { ok: true, turn: _turn };
    } catch (e) { return { ok: false, reason: 'write-failed' }; }
  }
  // 载入一次，之后 `_turn` 就是本会话的工作副本（tick 每轮改它，不每轮读盘——
  //   盘上那份是**恢复用**的，不是逐轮真源）。
  const _restored = turnLoad();
  if (_restored !== null) _turn = _restored;

  // ── v2.139.0（E8）：二阶公平的两个零件 ─────────────────────────────────────
  // 【零件一：可注入的随机源】
  //   本仓的随机一律走 `WA.rand`（core/rand.js）：它有显式播种与 `randStat().reproducible`，
  //   于是「加权随机」这件事可以被**复现**（同一个 seed 必得同一个序）。
  //   为什么不用 `Math.random()`：那样「它公平吗」在无头回归里没有答案，
  //   判据只能放宽成「看起来像随机」——本仓明令禁止的形态（判据不可证伪）。
  //   注意 `rand.pickWeighted(items, wf, ch)` 的契约是**返回单个元素**（内部一次带权滚动），
  //   不是返回 `take` 个的抽样器；本模块要的恰是「按权逐个取且不重复」，
  //   故用 `rand.next('life')`（单次均匀）配**权重接受/拒绝**自建，语义显式、且同样可复现。
  function fairSpin(rows, take) {
    const R = WA.rand;
    if (!R || typeof R.next !== 'function') { stat.fairThrows++; return null; }
    const pool = rows.slice();
    const out = [];
    let guard = 0;
    while (out.length < take) {
      // 硬上限：拒绝采样在最坏情况下可以长跑，而「某轮卡住」比「排得不够随机」严重得多。
      //   触顶即**如实记 fairThrows 并整体退回环形定序**（不做半个结果）。
      if (++guard > 64 + rows.length * 32) { stat.fairThrows++; return null; }
      let u = null;
      try { u = R.next('life'); } catch (e) { stat.fairThrows++; return null; }
      if (typeof u !== 'number' || !isFinite(u)) { stat.fairThrows++; return null; }
      const idx = Math.floor(Math.max(0, Math.min(0.999999999, u)) * pool.length);
      const cand = pool[idx];
      if (!cand) { stat.fairThrows++; return null; }
      // 接受概率 = 依据条数 / 候选组内最大依据条数 ⇒ 依据多者更容易被接受，
      //   低依据者仍**有机会**（这是与 E4 环形轮转的分水岭：这里没有固定环）。
      const maxN = rows.reduce(function (a, r) { const n = Math.max(1, Number(r.n) || 1); return n > a ? n : a; }, 1);
      const w = Math.max(1, Number(cand.n) || 1);
      if (u * maxN < w) { out.push(cand); pool.splice(idx, 1); }
      if (!pool.length) break;
    }
    // 取不满即整体失败（不做半个结果）：候选本就够 `take` 个，池被抽空只可能是契约外情形。
    if (out.length !== take) { stat.fairThrows++; return null; }
    return { rows: out };
  }
  // 【零件二：10 轮窗口读数】
  //   判据是「最近 10 轮里每人实际推进次数的**标准差** < 2」——这是**统计**判据而非结构判据，
  //   正是加权随机与环形轮转的分水岭：环形轮转拍胸脯说「每 G 轮必轮到一次」，
  //   却答不出「实际频率」；加权随机答不了「下一轮是谁」，但**频率**可被检验。
  //   窗口是进程态的环形缓冲（与 `_turn` 同族：不落盘、不新增容器键、不进存档）。
  const FAIR_WINDOW = 10;
  const _fairRounds = [];
  // v2.156.0（SP2）：当前活跃的**结算袋**（试演期非空，真跑为 null）。见 tickDraft 头注。
  let __bag = null;
  function fairPush(id) {
    if (!id) return;
    // v2.156.0：袋在场时写进袋的队列副本（试演失败可整体丢弃），否则写模块级环。
    const q = (__bag && Array.isArray(__bag.fair)) ? __bag.fair : _fairRounds;
    q.push(id);
    if (q.length > FAIR_WINDOW) q.shift();
  }
  function fairnessOf() {
    const counts = {};
    _fairRounds.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    const ids = Object.keys(counts);
    const rows = ids.map(function (id) { return { id: id, n: counts[id] }; })
      .sort(function (a, b) { return (b.n - a.n) || (a.id < b.id ? -1 : 1); });
    // 样本少于 2 人时**标准差无意义**（一个人「非常平均」是恒真句）⇒ 如实报 null 而不是 0。
    let sd = null;
    if (rows.length >= 2) {
      const mean = rows.reduce(function (a, r) { return a + r.n; }, 0) / rows.length;
      sd = Math.sqrt(rows.reduce(function (a, r) { return a + (r.n - mean) * (r.n - mean); }, 0) / rows.length);
      sd = Math.round(sd * 1000) / 1000;
    }
    return { window: FAIR_WINDOW, rounds: _fairRounds.length, sd: sd,
      // `fair` 就是**判据本身**（与专锁同一处阈值）：SD 可算且 < 2 才算公平；
      //   样本不足时为 null —— 「还没法判」与「判下来是公平的」绝不同形。
      fair: sd === null ? null : sd < 2,
      roundsUsed: stat.fairRounds, throws: stat.fairThrows, counts: counts, rows: rows };
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 80); }
  function personId(name) { const n = clean(name, 60); return n ? 'p_' + n : ''; }
  function ensureLife(person) {
    if (!person.life || typeof person.life !== 'object' || Array.isArray(person.life)) person.life = { goals: [], commitments: [], schedule: [], lastDecision: null };
    ['goals', 'commitments', 'schedule'].forEach(function (k) { if (!Array.isArray(person.life[k])) person.life[k] = []; });
    return person.life;
  }
  function relationTo(person, target) {
    const rels = person && person.profile && Array.isArray(person.profile.relations) ? person.profile.relations : [];
    return rels.filter(function (r) { return r && clean(r.target, 60) === clean(target, 60); }).pop() || null;
  }
  function decide(goal, person, facts) {
    const f = facts || {};
    const rel = relationTo(person, f.with || '');
    const trust = rel && isFinite(Number(rel.trust)) ? Number(rel.trust) : null;
    const vigilance = rel && isFinite(Number(rel.vigilance)) ? Number(rel.vigilance) : null;
    if (f.crisis) return { action: 'pause', reason: 'crisis' };
    if (f.need && !f.resource) return { action: 'seek', reason: 'resource-missing' };
    if (vigilance !== null && vigilance >= 70) return { action: 'hide', reason: 'high-vigilance' };
    if (trust !== null && trust >= 55 && f.with) return { action: 'ask', reason: 'trusted-person' };
    if (!goal.prerequisite || f.ready === true) return { action: 'advance', reason: 'ready' };
    return { action: 'wait', reason: 'prerequisite-open' };
  }
  /**
   * v2.85.0 B1：协作必须**对称持有**。
   *   kind='cooperation' 的承诺只有在对方也持有一行指向此人的同事项合作时才成立。
   *   单方面宣布的合作不是合作——否则「我说了我们要一起做」就等价于「我们一起做」。
   *   注意：本函数**只读**，不修改任何一方（拒收/降级不得顺手删掉事实）。
   */
  function reciprocated(draft, person, cmt) {
    const other = (draft.people || {})[personId(cmt.target)];
    const lf = other && other.life;
    if (!lf || !Array.isArray(lf.commitments)) return false;
    const me = clean(person.name, 60) || String(person.id || '').replace(/^p_/, '');
    return lf.commitments.some(function (x) {
      return x && x.status === 'active' && x.kind === 'cooperation'
        && clean(x.target, 60) === me && clean(x.text, 80) === clean(cmt.text, 80);
    });
  }
  function commitmentAction(item, facts) {
    if (facts && Array.isArray(facts.fulfilledIds) && facts.fulfilledIds.indexOf(item.id) >= 0) return 'keep';
    if (item.kind === 'boundary') return 'hide';
    return item.due && facts && facts.now && facts.now > item.due ? 'pause' : 'keep';
  }
  /**
   * v2.86.0 A3（事实唯一写者）：本函数**不再自己造人**，改为委托 registry.ensurePerson。
   *
   * 修前 `draft.people[id] || (draft.people[id] = {...})` 是一个「方便」的取值器，
   *   顺手把自己变成了创建者：写一条目标/承诺/日程就凭空多出一个人（占 cap 48 名额、
   *   把真在场上的人物挤出去），且条目上没有留下任何痕迹。
   *
   * 现口径：创建统一走 registry（唯一写者 + createdVia 标签）。
   *   合成宿主桩里没有 registry，此时保留**等价兜底**并打 `life:fallback` ——
   *   于是「产品运行时到底走没走唯一写者」可以由专锁断言，而不是靠读代码相信。
   */
  function person(draft, name) {
    const id = personId(name);
    if (!id) return null;
    const reg = WA.registry;
    if (reg && typeof reg.ensurePerson === 'function') {
      const r = reg.ensurePerson(draft, id, clean(name, 60), 'life');
      return r && r.row ? r.row : null;
    }
    return draft.people[id] || (draft.people[id] = { id: id, name: clean(name, 60), knowledge: {}, createdVia: 'life:fallback', createdAt: clockNow('life') });
  }

  function addGoal(name, goal) {
    if (!personId(name)) return { ok: false, reason: 'missing-person' };
    const text = clean(goal && goal.text, 80);
    if (!text) return { ok: false, reason: 'missing-text' };
    let out = null;
    WA.store.transact(function (draft) {
      const p = person(draft, name), life = ensureLife(p);
      const row = { id: 'goal_' + clockNow('life') + '_' + life.goals.length, text: text, motive: clean(goal.motive, 40), prerequisite: clean(goal.prerequisite, 60), next: clean(goal.next, 60), obstacle: clean(goal.obstacle, 60), status: 'active', at: clockNow('life') };
      life.goals = life.goals.concat([row]).slice(-8); p.updatedAt = row.at; out = { ok: true, id: row.id };
    }, 'life:add-goal');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function addCommitment(name, item) {
    const target = clean(item && item.target, 60), text = clean(item && item.text, 80);
    if (!personId(name) || !target || !text) return { ok: false, reason: 'missing-fields' };
    if (COMMITMENTS.indexOf(item.kind) < 0) return { ok: false, reason: 'bad-kind' };
    let out = null;
    WA.store.transact(function (draft) {
      const p = person(draft, name), life = ensureLife(p);
      const row = { id: 'cmt_' + clockNow('life') + '_' + life.commitments.length, kind: item.kind, target: target, text: text, due: isFinite(Number(item.due)) ? Number(item.due) : 0, status: 'active', at: clockNow('life') };
      // v2.61.0: 与 addGoal 同规格——本文件写了 updatedAt 的只有 addGoal，本条漏掉，
      //   于是同一个人「有承诺」反而比「有目标」更早被淘汰（同一文件内自相矛盾）。
      life.commitments = life.commitments.concat([row]).slice(-12); p.updatedAt = row.at; out = { ok: true, id: row.id };
    }, 'life:add-commitment');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function addSchedule(name, item) {
    const activity = clean(item && item.activity, 40), start = Number(item && item.start), end = Number(item && item.end);
    if (!personId(name) || !activity) return { ok: false, reason: 'missing-fields' };
    if (!isFinite(start) || !isFinite(end) || end <= start) return { ok: false, reason: 'bad-time' };
    let out = null;
    WA.store.transact(function (draft) {
      const p = person(draft, name), life = ensureLife(p);
      if (life.schedule.some(function (x) { return x.status === 'active' && start < x.end && end > x.start; })) { out = { ok: false, reason: 'time-conflict' }; return false; }
      const row = { id: 'sch_' + clockNow('life') + '_' + life.schedule.length, activity: activity, location: clean(item.location, 40), start: start, end: end, status: 'active' };
      // v2.61.0: 同 addCommitment——日程是「人物在做什么」，且日程自带 start/end（未来时刻），
      //   恰是**最该留在场上**的那类人物；缺 updatedAt 会让它最先被挤出。
      life.schedule = life.schedule.concat([row]).slice(-12); p.updatedAt = clockNow('life'); out = { ok: true, id: row.id };
    }, 'life:add-schedule');
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * v2.156.0（SP2）：**带草稿的结算体**（tick 与试演路径共用）。
   *   门（enabled）与游标写盘留在公开入口 `tick` 里；本函数只做「在给定草稿上把这一轮推完」
   *   + stat 记账（ticks/changed/blocked/skipped/unreciprocated/lastReason）。
   *   袋子 `bag` 非空时（试演）：stat 与轮转游标 `_turn` 的读写都落在袋内副本上，
   *   fairPush 也写袋（见 __bag）；退出时无条件还原 —— 失败可整袋丢弃，
   *   世界草稿则由调用方的事务层决定提交或丢弃。真跑路径 bag 为 null，行为与旧版逐字一致。
   * @param {object} draft 事务草稿
   * @param {object} [facts] 与旧 tick 同一形状
   * @param {object|null} [bag] 结算袋（makeBag() 的产物）
   */
  function tickDraft(draft, facts, bag) {
    const prevBag = __bag, prevStat = stat, prevTurn = _turn;
    if (bag) { __bag = bag; stat = bag.stat; _turn = bag.turn; }
    try {
      const cfg = settings(); stat.lastAt = clockNow('life');
      if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: true, changed: 0, skipped: 0, unreciprocated: 0, reason: 'disabled' }; }
      const f = facts || {}; let changed = 0, skipped = 0, unrecip = 0;
      // v2.85.0 B1：名单不再按插入序截断。旧口径 `Object.keys(...).slice(0, maxPeople)`
      //   让「谁被推演」取决于谁先进场——有依据的人插在第 5 位之后就永远轮不到。
      //   现口径：**有依据者优先**（依据条数多者先，同依据按下标稳定），无依据者不占名额。
      const basisOf = function (id) {
        const p0 = draft.people[id], lf = p0 && p0.life;
        if (!lf || typeof lf !== 'object') return 0;
        let n = 0;
        if (Array.isArray(lf.goals) && lf.goals.some(function (x) { return x && x.status === 'active'; })) n++;
        if (Array.isArray(lf.commitments) && lf.commitments.some(function (x) { return x && x.status === 'active'; })) n++;
        if (Array.isArray(lf.schedule) && lf.schedule.some(function (x) { return x && x.status === 'active'; })) n++;
        return n;
      };
      const ranked = Object.keys(draft.people || {}).map(function (id, i) {
        return { id: id, n: basisOf(id), i: i };
      }).filter(function (r) { return r.n > 0; });
      ranked.forEach(function (r, j) { r.j = j; });
      ranked.sort(function (a, b) { return (b.n - a.n) || (a.j - b.j); });
      const N = ranked.length;
      // v2.115.0（规划 01 的 E4）：**同等依据者按组轮转定序**。
      //   旧口径同依据时固定按进场下标（`a.i - b.i`）+ 截断 —— 6 人同等依据、名额 4 时，
      //   后两位**每一轮都被跳过**：`skipped` 有账，但「谁总也没轮到」不可见，
      //   那两个人永远拿不到 `lastDecision`（静态排序 + 截断 = 位置决定命运）。
      //   现口径分两层：
      //     ① 组间**严格按下标**（依据多者绝对优先，同级才谈公平）；
      //     ② 名额切点**所在的那一组**按 `_turn` 环形轮转 —— 每轮从上一轮的末尾接下去，
      //        该组 `ceil(G / take)` 轮之内每人都排到过每一位。
      //   为什么不是「全体一个大环」：那样某轮会把低依据者排在高依据者之前，
      //   把「依据优先」这条更硬的规则破坏掉。轮转只在同级、只在切点处发生。
      const groups = [];
      ranked.forEach(function (row) {
        const last = groups.length ? groups[groups.length - 1] : null;
        if (last && last.n === row.n) last.rows.push(row);
        else groups.push({ n: row.n, rows: [row] });
      });
      // 名额不足时**必须留痕**：静默少推演一个人，与「他本来没事可做」在读数上长得一样。
      skipped = Math.max(0, N - cfg.maxPeople);
      let rest = Math.max(0, cfg.maxPeople);
      const picks = [];
      groups.forEach(function (g) {
        if (rest <= 0) return;
        const G = g.rows.length;
        const take = Math.min(G, rest);
        let seq = g.rows;
        // 整组装得下 ⇒ 不轮转（轮转只在「有人要等」的地方才有意义）；
        // 只在这组装不下时把游标推进 `take`，于是下一轮从这一轮的末尾接着取。
        if (take < G) {
          // v2.139.0（E8）二阶治理：把「组内定序」交给可注入的加权随机源。
          //   权重 = 依据条数（下限 1）⇒ 依据多者概率大、低依据者仍有机会；
          //   依据为 0 者早被 `ranked` 滤掉，**不进候选**（加权随机不改准入门槛）。
          //   抽不出来（无随机源 / 抛错 / 拒绝采样触顶）⇒ 退回 E4 的环形定序并记 fairThrows。
          const spin = fairSpin(g.rows, take);
          if (spin) { seq = spin.rows; _turn = (_turn + take) % G; stat.fairRounds++; }
          else {
            const shift = _turn % G;
            seq = g.rows.slice(shift).concat(g.rows.slice(0, shift));
            _turn = (_turn + take) % G;
          }
        }
        picks.push.apply(picks, seq.slice(0, take));
        rest -= take;
      });
      picks.forEach(function (row) {
        const id = row.id;
        const p = draft.people[id]; if (!p || !p.life) return;
        const life = ensureLife(p);
        const active = life.schedule.filter(function (x) { return x.status === 'active' && f.now >= x.start && f.now < x.end; })[0];
        const goal = life.goals.filter(function (x) { return x.status === 'active'; })[0];
        const commitment = life.commitments.filter(function (x) { return x.status === 'active'; })[0];
        const fulfilled = commitment && Array.isArray(f.fulfilledIds) && f.fulfilledIds.indexOf(commitment.id) >= 0;
        const supplied = f.decision && f.decision.action ? f.decision : null;
        // v2.85.0 B1：单向协作**不得**被当作可依承诺。
        //   位置刻意放在「有目标的人走目标路径」之后：协作被回应与否，不该拦下一个本来
        //   就有自己目标的人；它只影响「除了这条协作之外别无依据」的那种人。
        const lone = !!(commitment && commitment.kind === 'cooperation' && !reciprocated(draft, p, commitment));
        if (lone) unrecip++;
        let decision = fulfilled ? { action: 'keep', reason: 'commitment-fulfilled' }
          : (supplied ? supplied
            : (goal ? decide(goal, p, f)
              : (lone ? { action: 'wait', reason: 'unreciprocated' }
                : (commitment ? { action: commitmentAction(commitment, f), reason: 'commitment' }
                  : (active ? { action: 'keep', reason: 'schedule' } : null)))));
        if (!decision) return;
        if (fulfilled) commitment.status = 'kept';
        life.lastDecision = { action: decision.action, reason: decision.reason, goal: goal ? goal.id : '', at: f.now || stat.lastAt };
        if (decision.action === 'advance' && goal && !goal.next) goal.next = '推进中';
        // v2.61.0: tick 改写了当前意图（观测面 `observe.slice` 的输入），却不算「人物被更新」——
        //   于是本轮真正在行动的人物，在淘汰排序上仍是「最旧」。
        p.intent = decision.action === 'wait' ? '等待条件' : decision.reason; p.updatedAt = f.now || stat.lastAt; changed++;
      });
      // 窗口只在**真的推演过**时累积：`picks` 是这一轮真正走到决策的人，
      //   用 `ranked` 会把「没排上的人」也算成推过一次（频率当场失真）。
      picks.forEach(function (row) { fairPush(row.id); });
      stat.ticks++; stat.changed += changed; if (!changed) stat.blocked++;
      stat.skipped += skipped; stat.unreciprocated += unrecip;
      stat.lastReason = changed ? 'updated' : 'nothing-to-do';
      return { ok: true, changed: changed, reason: stat.lastReason, skipped: skipped, unreciprocated: unrecip };
    } finally {
      if (bag) { __bag = prevBag; stat = prevStat; _turn = prevTurn; }
    }
  }

  function tick(facts) {
    const cfg = settings(); stat.lastAt = clockNow('life');
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: true, changed: 0, reason: 'disabled' }; }
    let changed = 0, skipped = 0, unrecip = 0;
    WA.store.transact(function (draft) {
      const r = tickDraft(draft, facts, null);
      changed = r.changed; skipped = r.skipped; unrecip = r.unreciprocated;
    }, 'life:tick');
    // v2.132.0（O19）：本轮游标推完才写盘 —— 盘上那份永远等于「上一次结算结束时他从哪一位接着排」。
    //   写在事务**之外**（游标不是世界事实，事务里写它就是拿一个进程量去改世界快照）。
    //   关闭开关时 `turnStore()` 直接返回 disabled，**零写盘**。
    const persisted = turnStore();
    // skipped 与 unreciprocated 进返回值：调用方要能当场看见「没被推演」的原因，
    //   而不是只能事后从 stat 里猜。
    return { ok: true, changed: changed, reason: stat.lastReason, skipped: skipped, unreciprocated: unrecip, turn: persisted };
  }

  // ── v2.156.0（SP2）：结算袋三件套 ─────────────────────────────────────
  //   试演（离线批）要在**不碰真世界、不碰模块真读数**的前提下把一轮推完，成功后整体并回。
  //   袋子把 stat（全字段标量）与轮转游标 _turn 接住；fair 窗口由 fairPush 直接写袋。
  //   失败路径：整袋丢弃、零残留；成功路径：commitBag 并回。
  /** 造一只空袋：stat 浅拷贝（全字段标量）+ fair 窗口副本 + 游标副本。 */
  function makeBag() {
    return { stat: Object.assign({}, stat), fair: _fairRounds.slice(), turn: _turn };
  }
  /** 把袋内结果并回模块态（逐字段赋值，保持 stat 对象同一性：既有读者持有同一引用）。 */
  function commitBag(bag) {
    if (!bag || typeof bag !== 'object') return false;
    if (bag.stat && typeof bag.stat === 'object') {
      Object.keys(bag.stat).forEach(function (k) { stat[k] = bag.stat[k]; });
    }
    if (Array.isArray(bag.fair)) { _fairRounds.length = 0; bag.fair.forEach(function (id) { _fairRounds.push(id); }); }
    if (isFinite(Number(bag.turn))) _turn = Number(bag.turn);
    return true;
  }

  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lines = [];
    Object.values((WA.store.get() || {}).people || {}).filter(function (p) { return p && p.life; }).slice(0, cfg.maxPeople).forEach(function (p) {
      const goals = (p.life.goals || []).filter(function (x) { return x.status === 'active'; }).slice(0, cfg.maxItems);
      const cs = (p.life.commitments || []).filter(function (x) { return x.status === 'active'; }).slice(0, cfg.maxItems);
      if (!goals.length && !cs.length && !p.life.lastDecision) return;
      lines.push(p.name + '：' + goals.map(function (x) { return '目标「' + x.text + '」'; }).concat(cs.map(function (x) { return x.kind + '「' + x.text + '」'; })).join('；') + (p.life.lastDecision ? '；当前选择=' + p.life.lastDecision.action : ''));
    });
    return lines.length ? '[人物生活]\n' + lines.join('\n') + '\n只把这些当作人物的既有动机与安排；条件不足时人物可以等待，不得据此编造新的履历。' : '';
  }

  WA.life = {
    ACTIONS: ['wait', 'advance', 'ask', 'hide', 'seek', 'pause', 'keep'], COMMITMENTS: COMMITMENTS,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    addGoal: addGoal, addCommitment: addCommitment, addSchedule: addSchedule, tick: tick, decide: decide, buildBlock: buildBlock,
    // v2.156.0（SP2）：离线批（offline-return）的**结算入口**。tickDraft 在给定草稿上把一轮推完；
    //   makeBag/commitBag 是「试演期整体隔离、成功整体并回」的两端（失败路径整袋丢弃、零残留）。
    tickDraft: tickDraft, makeBag: makeBag, commitBag: commitBag,
    // v2.115.0（规划 01 的 E4）：`lastTurn` 挂在**既有成员** `stat()` 的返回里
    //   （不改导出面：本仓纪律是「零消费能力当场删」，为读一个游标新开一口会立即变成死导出）。
    // v2.132.0（O19）：同一口径再加两个读数——`turnRestored`（本会话开局是从盘上恢复的还是归零的）
    //   与 `turnPersisted`（上一次结算的落盘结论）。**零新增导出**：三口读数全在这一个既有成员里。
    //   它不进 store（见 TURN_KEY 上方：进了存档就等于把「上次从谁开始」当成世界事实，
    //   而导出/导入世界会把它一起搬走）。写侧只有 tick 一处。
    stat: function () { return Object.assign({}, stat, { lastTurn: _turn, turnRestored: _restored !== null,
      // v2.139.0（E8）：二阶公平读数挂在**既有成员**里——本仓纪律是「为读一个量新开一口，
      //   那一口当场就是死导出」，故 `life.fairness` 这个口**刻意不存在**。
      fairness: fairnessOf() }); }
  };
})();
