/**
 * WorldAxis engines/day-route.js (v2.266.0) — 人物今日动线：NPC 的一天看得见
 *
 * 【EXV6-2】把「今天在哪 / 做了什么 / 接下来要做什么」三段从既有事实里现算成人话。
 *   纯读聚合，零新容器、零 store.transact。
 *
 * 【为什么不新开一本动线】与 world-diary 同一条纪律：
 *   做一个 `dayRoute.rows[]` 容器、每轮往里写一段，看起来最省事 —— 但那等于把
 *   「谁在哪、做了什么」记两份，第二份必然与第一份漂移（life 改了结算，动线还在念旧的）。
 *   这里只从既有两个 owner 的读口现算：
 *     ① `life` —— `people.<id>.life` 的 goals / commitments / schedule / lastDecision
 *     ② `laborSchedule` —— `view({who, day})` 的当天排班（纯读，零写入）
 *   故事日**不自己算**：直接读 `laborSchedule.view({}).day` —— 那是既有 owner 现算的
 *   单一真源（playtime 剧情日 → 世界钟日序 → 排班模块的当前日 → 兜底第 1 日），
 *   本模块重写一份就会成为第二个口径。
 *
 * 【信息边界：只报玩家视角能知道的】与 world-diary 同口径（EXV6-1 已实测裁定）：
 *   · 唯一可用口是 `noesis.perceive(person, placeId)` —— 从玩家视角问「这个人能感知到
 *     这个地方吗」，四态 present / impaired / out / unknown；
 *   · `epistemic-view` 是**信念面**（某人以为什么），拿它判可见性是类型错配，故不接；
 *   · 边界口缺席时**不假装能判**：`why:'boundary-absent'`，此时不点名、也不说
 *     「他在你看不见的地方」—— 那是把「判不了」写成「判了且为否」。
 *   · 边界口的**可用性判定复用 `worldDiary.boundary()`**（EXV6-1 已把它收成一处）；
 *     它缺席时才退化为本地探测并打 `boundary-fallback` 计量 —— 单独剥离任一模块时
 *     另一模块仍可用，且「到底走了哪条路」在 stat 里看得见。
 *
 * 【这一版抓到并如实分栏的真缺陷：日程时间域有两个】
 *   实测（仓外探针 /tmp/probe_sched_domain.js）：`life.addSchedule` 接受 start=8 end=12，
 *   而 `life.tickDraft` 判「此刻在日程上」用的是 `f.now >= x.start && f.now < x.end`，
 *   其中 `f.now` 是 `clock.now()` 的**毫秒**时间戳（约 1.79e12）。
 *   于是同一字段上并存两种域：
 *     · 传毫秒（nowMs-1000 / nowMs+1000）⇒ 真命中，`lastDecision.reason === 'schedule'`；
 *     · 传小时（8 / 12）⇒ **恒不命中**，`changed:0 / lastDecision:null`。
 *   本模块**不改既有引擎的行为**（那是既有 owner 的结算面，改动会牵动既有专锁），
 *   但绝不能把「恒不命中」读成「他今天没有安排」—— 那是拿读不到当读到了。
 *   故 `scheduleDomain()` 把 active 日程的域分成 absolute / clock / unknown / mixed 四态：
 *     · absolute ⇒ 可以与 `clock.now()` 同域比较，能答「此刻在不在日程上」；
 *     · clock    ⇒ **判不了此刻**（域不同），只列出「今天排了哪几个时段」，不猜；
 *     · mixed / unknown ⇒ 同样判不了，如实报 why。
 *   「今天没安排」与「安排了但判不了此刻」因此不同形 —— D 段与专锁把这条钉住。
 *
 * 【本模块不做的事】
 *   · 不生成、不调模型：全部是既有事实的措辞化，故无 API 时也随时可调用；
 *   · 不改任何引擎状态：连 `life.tick` 都不碰；
 *   · 不编造：三段全无来源时给 `quiet:true`，而不是编一句「他在忙自己的事」。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const LS_KEY = 'worldaxis_day_route_settings_v1';
  const DEF = {
    enabled: true,
    maxPeople: 3,      // 一屏看几个人：动线是「一眼看完」，不是人物总表
    showNext: true,    // 「接下来要做什么」要不要念（有人只想看此刻）
    hidePlace: false   // 手动强制隐去地名（与 world-diary 同开关语义）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'dayRoute', bounds: { maxPeople: [1, 8] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
      const raw = WA.settingsBus.read(__REG);
      const merged = Object.assign({}, DEF, raw || {});
      return typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
    }
    return Object.assign({}, DEF);
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }

  const __stat = {
    builds: 0, peopleScanned: 0, linesEmitted: 0, quietBuilds: 0,
    whereKnown: 0, whereHidden: 0, whereUnknown: 0, whereUnjudgeable: 0, whereSuppressed: 0,
    scheduleAbsolute: 0, scheduleClock: 0, scheduleUnjudgeable: 0,
    boundaryConsulted: 0, boundaryAvailable: 0, boundaryFallback: 0,
    lastReason: '', faults: {}
  };
  function fault(k) { __stat.faults[k] = (__stat.faults[k] || 0) + 1; }
  /** 只读、失败即降级（本仓纪律：观察层失败不许影响主链）。 */
  function safe(fn, fb) {
    try { const v = fn(); return v === undefined ? fb : v; } catch (e) { fault('read-threw'); return fb; }
  }
  function txt(v, max) {
    const s = (v === null || v === undefined) ? '' : String(v);
    return s.replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }

  // ── 动作词与原因词的人话映射 ─────────────────────────────────────────────
  //   为什么必须映射：`lastDecision` 是给机器读的（action/reason 是枚举码）。
  //   玩家面出现 'keep' / 'commitment-fulfilled' 这类词 = 把内部 id 漏出去，
  //   与 world-diary「不含内部 id、不含技术词」是同一条硬约束。
  //   映射表**只有正向表 + 未知即不念**：给未知 reason 编一句解释就是编造。
  const ACTION_TEXT = {
    wait: '在等条件', advance: '在推进手上的目标', ask: '在找人商量',
    hide: '在回避', seek: '在找门路', pause: '暂停了', keep: '维持着手上这件事'
  };
  const REASON_TEXT = {
    schedule: '按今天的安排', commitment: '按答应过的事', 'commitment-fulfilled': '把答应的事办完了',
    ready: '条件已具备', 'prerequisite-open': '前提还没到', 'resource-missing': '缺东西在手',
    'high-vigilance': '防着人', 'trusted-person': '信得过对方', crisis: '遇上变故',
    unreciprocated: '对方还没回应'
  };
  function actionText(dec) {
    if (!dec || !dec.action) return '';
    const a = ACTION_TEXT[dec.action] || '';
    if (!a) return '';
    const r = REASON_TEXT[dec.reason] || '';
    return r ? a + '（' + r + '）' : a;
  }

  // ── 信息边界：与 world-diary 同口径，可用性判定**复用**它的 boundary() ─────────
  /**
   * 为什么复用而不是再写一份：`boundary()` 判的是「能不能判」（noesis.perceive 在不在 +
   * 玩家名取不取得到）—— 那是**同一件事**。两个模块各写一份，某天一处改了另一处不跟，
   * 「日记点名了、动线不点名」就会成为没人能解释的不一致。
   * 它缺席时退化为本地探测并打计量（`boundary-fallback`）：单独剥离任一模块仍可用，
   * 走的是哪条路在 stat 里看得见（不静默降级）。
   */
  function boundary() {
    const wd = WA.worldDiary;
    if (wd && typeof wd.boundary === 'function') {
      const b = safe(function () { return wd.boundary(); }, null);
      if (b && typeof b.available === 'boolean') {
        return { available: b.available, player: txt(b.player, 40), why: b.why || '',
          via: 'worldDiary.boundary', sources: Array.isArray(b.sources) ? b.sources.slice() : [] };
      }
      fault('boundary-owner-threw');
    }
    __stat.boundaryFallback++;
    const n = WA.noesis;
    const perceiveOk = !!(n && typeof n.perceive === 'function');
    let player = '';
    if (perceiveOk) {
      player = txt(safe(function () {
        const wk = WA.worldBridge && typeof WA.worldBridge.worldKey === 'function' ? WA.worldBridge.worldKey() : null;
        return wk && wk.player;
      }, ''), 40);
    }
    return { available: !!(perceiveOk && player),
      player: player, why: !perceiveOk ? 'noesis.perceive-absent' : (!player ? 'player-unknown' : ''),
      via: 'fallback', sources: perceiveOk ? ['noesis.perceive'] : [] };
  }
  /**
   * 真·看不见的**唯一**来源：world.canBeAt 给出过的、有依据的可达性否决原因。
   *   这张表必须**白名单**而不是黑名单：新出现的 reason（world.js 后续版本可能加）
   *   默认落到「判不了」那一侧，不会静默变成一句「他看不见」——
   *   反过来的黑名单会让每个新增 reason 都自动变成「看不见」的假话。
   */
  const HIDDEN_VIA = ['closed', 'window-too-short', 'scheduled-elsewhere', 'unreachable'];
  /**
   * 地点可见性三态（与 world-diary.placeVisible 逐条同语义）：
   *   · `known`    ⇒ 点名（`range:impaired` 加「远远地」）；
   *   · `hidden`   ⇒ 有地名但玩家看不见 —— 才允许说「在你看不见的地方」；
   *   · `unknown`  ⇒ 本来没地名 / 判不了 —— **不许**说「看不见」（那是拿读不到当读到了）。
   * 三态必须分开：压成一个 `hidden` 会让它在多数行上恒真，那样它不再是判据。
   */
  function placeState(place, b, forceHide) {
    const p = txt(place, 40);
    if (!p) return { state: 'unknown', place: '', why: 'no-place' };
    // 玩家主动要求不显示地名 ⇒ **不是**「看不见」。世界没挡他，是他不想看。
    //   写成 hidden 等于用可见性去改写事实（本仓反复付价的那类错）。
    if (forceHide === true) return { state: 'suppressed', place: '', why: 'forced-hide' };
    if (!b.available) return { state: 'unknown', place: '', why: b.why || 'boundary-absent' };
    const r = safe(function () { return WA.noesis.perceive(b.player, p); }, null);
    // `ok:false` 是**判不了**（未启用/缺字段），不是「看不见」—— 两支处置相反。
    if (!r || r.ok !== true) return { state: 'unknown', place: '', why: 'perceive-' + ((r && r.reason) || 'failed') };
    if (r.range === 'present') return { state: 'known', place: p, why: '' };
    if (r.range === 'impaired') return { state: 'known', place: p, why: '', far: true };
    // 剩下的都是 `range:'out'` / `range:'unknown'`。**这两类不能一律读成「看不见」**：
    //   `range:'unknown'` 是「感知半径功能关着」或「可达性判不出来」；
    //   `range:'out'` 的 via 可能是 `unknown-place` —— 世界地图里**根本没登记这一处**，
    //   那正是 world.canBeAt 里写着「不猜」的那一支。把「没有这一处的记录」说成
    //   「他看不见那一处」，就是用可见性去改写事实（本节最贵的一条纪律）。
    //   故只认**已知有依据的否决原因**（下面这张表），其余一律判不了。
    //   方向是刻意选的：默认偏「判不了」而不是偏「看不见」—— 前者只是没答案，
    //   后者是一句假话，而假话会被玩家当成真的读下去。
    const via = r.via ? String(r.via) : '';
    const why = String(r.range || r.reason || 'unknown') + (via ? ':' + via : '');
    if (r.range === 'out' && HIDDEN_VIA.indexOf(via) >= 0) return { state: 'hidden', place: '', why: why };
    return { state: 'unknown', place: '', why: why };
  }
  function atPlace(st) {
    if (st.state === 'known' && st.place) return (st.far ? '远远地在' : '在') + st.place;
    if (st.state === 'hidden') return '在你看不见的地方';
    return '';
  }

  // ── 日程时间域：两种域并存这件事必须显式分开（见文件头「本版抓到的真缺陷」）──
  const ABS_MIN = 1e11; // 毫秒量级下界（2001 年之后都大于它；小时/分钟口径远小于它）
  /**
   * 把 active 日程的时间域分类。
   * @returns {{state:'none'|'absolute'|'clock'|'unknown'|'mixed', rows:Array, why:string}}
   *   · `absolute` ⇒ 可与 `clock.now()` 同域比较（能答「此刻在不在日程上」）；
   *   · `clock`    ⇒ 小时制（0..24）：**域不同，判不了此刻**，只列时段；
   *   · `mixed` / `unknown` ⇒ 判不了，如实报 why（不折成「没有安排」）。
   */
  function scheduleDomain(rows) {
    const list = (Array.isArray(rows) ? rows : []).filter(function (r) { return r && r.status === 'active'; });
    if (!list.length) return { state: 'none', rows: [], why: '' };
    let abs = 0, clk = 0, other = 0;
    list.forEach(function (r) {
      const s = num(r.start), e = num(r.end);
      if (s === null || e === null || s <= 0 || e <= 0 || e <= s) { other++; return; }
      if (s >= ABS_MIN && e >= ABS_MIN) abs++;
      else if (s <= 24 && e <= 24) clk++;
      else other++;
    });
    if (abs === list.length) return { state: 'absolute', rows: list, why: '' };
    if (clk === list.length) return { state: 'clock', rows: list, why: 'clock-domain' };
    if (other === list.length) return { state: 'unknown', rows: list, why: 'bad-range' };
    return { state: 'mixed', rows: list, why: 'mixed-domain' };
  }
  /** 只在 absolute 域下作答：此刻落在哪一条日程上（判不了就如实返回空）。 */
  function onScheduleNow(dom, now) {
    if (!dom || dom.state !== 'absolute') return null;
    if (now === null) return null;
    const hit = dom.rows.filter(function (r) { return now >= num(r.start) && now < num(r.end); })[0];
    return hit || null;
  }
  /** 时钟域下的时段清单（只说「排了哪几个时段」，不猜此刻）。 */
  function clockSlots(dom) {
    if (!dom || dom.state !== 'clock') return [];
    return dom.rows.map(function (r) { return { activity: txt(r.activity, 30), location: txt(r.location, 30), start: num(r.start), end: num(r.end) }; })
      .filter(function (x) { return !!x.activity; });
  }

  // ── 三个 owner 的只读取数 ────────────────────────────────────────────────
  /** 故事日：直接读 laborSchedule 的读口（单一真源，不重算）。返回 {ok, day, why}。 */
  function storyDay() {
    const v = safe(function () {
      return (WA.laborSchedule && typeof WA.laborSchedule.view === 'function') ? WA.laborSchedule.view({}) : null;
    }, null);
    if (v && v.ok === true && num(v.day) !== null) return { ok: true, day: Math.floor(num(v.day)), why: '' };
    // 读不到故事日不是「今天没有安排」—— 两件事，分开报。
    return { ok: false, day: null, why: (v && v.reason) || 'laborSchedule-absent' };
  }
  /** 当天排班（可指定人）：走既有 view 读口，纯读零写入。 */
  function bookings(day, who) {
    const v = safe(function () {
      if (!WA.laborSchedule || typeof WA.laborSchedule.view !== 'function') return null;
      return WA.laborSchedule.view({ day: day, who: who || '' });
    }, null);
    if (!v || v.ok !== true) return { ok: false, list: [], why: (v && v.reason) || 'laborSchedule-absent' };
    return { ok: true, list: Array.isArray(v.bookings) ? v.bookings : [], why: '' };
  }

  // ── 三段组装 ────────────────────────────────────────────────────────────
  /**
   * 每段统一成 `{state, text, why}`：
   *   `known`      有依据，text 是人话；
   *   `none`       确实没有（读了、读到了、没有）；
   *   `unreadable` 读不到 / 判不了（**不是** none）。
   * 这三态是本节的核心：合并任何一个都会让读数变成假绿。
   */
  function segKnown(t) { return { state: 'known', text: t, why: '' }; }
  function segNone(why) { return { state: 'none', text: '', why: why || '' }; }
  function segUnreadable(why) { return { state: 'unreadable', text: '', why: why || '' }; }

  /**
   * ① 今天在哪。
   *   来源优先级：
   *     a) absolute 域日程里「此刻命中」那一条的 location（最具体：他此刻在这件事的场地）；
   *     b) `people.<id>.location`（既有引擎写的当前位置，demographic-flow / action-desk 的写点）；
   *     c) clock 域日程 ⇒ 判不了此刻，但可答「今天排在哪几处」（**换一种说法**，不是同一句）；
   *     d) 都没有 ⇒ none。
   */
  function segWhere(person, dom, now, b, opt) {
    const hit = onScheduleNow(dom, now);
    let place = '', basis = '';
    if (hit) { place = txt(hit.location, 40); basis = 'schedule-now'; }
    if (!place) { const loc = txt(person && person.location, 40); if (loc) { place = loc; basis = 'person-location'; } }
    if (place) {
      const st = placeState(place, b, opt.hidePlace);
      if (st.state === 'known') return { state: 'known', text: '今天' + atPlace(st), why: '', basis: basis, place: st.place };
      if (st.state === 'hidden') return { state: 'known', text: '今天在你看不见的地方', why: st.why, basis: 'hidden', place: '' };
      // 玩家自己关了地名：说的是「不显示」，不是「看不见」。
      if (st.state === 'suppressed') return { state: 'known', text: '今天在某个地方（按你的设置不显示地名）',
        why: st.why, basis: 'suppressed', place: '' };
      // 判不了可见性：**不点名**，但也不说「看不见」—— 换一句不含地点的话。
      //   措辞刻意不写「你的视野判不了」：那读起来像游戏机制，而真实原因通常是
      //   「玩家名还没定」或「边界口未启用」。把内部原因写进玩家面 = 另一种技术词泄漏。
      return { state: 'known', text: '今天在某个地方（这一处能不能看见还说不准）',
        why: st.why, basis: 'unjudgeable', place: '' };
    }
    if (dom.state === 'clock') {
      const slots = clockSlots(dom).filter(function (x) { return !!x.location; });
      if (slots.length) {
        const names = slots.map(function (x) { return txt(x.location, 20); }).filter(Boolean);
        const uniq = names.filter(function (v, i) { return names.indexOf(v) === i; });
        return { state: 'known', text: '今天排的地方有 ' + uniq.slice(0, 2).join('、') + '（此刻在哪说不准）',
          why: 'clock-domain', basis: 'schedule-clock-slot', place: '' };
      }
    }
    if (dom.state === 'none' || dom.state === 'clock') return segNone('no-place-fact');
    return segUnreadable(dom.why || 'schedule-unknown');
  }
  /**
   * ② 做了什么。
   *   来源：`life.lastDecision`（引擎**真实结算过**的上一决策）+ 当天已订任务。
   *   注意 `lastDecision` 为 null 有两种成因：「他没被推演到」（名额/依据不足）与
   *   「life 关着根本没结算」—— 后者读 settings 才知道，故分别报 why。
   */
  function segDid(person, lifeOn, booked) {
    const life = person && person.life;
    if (!lifeOn) return segUnreadable('life-disabled');
    const dec = life && life.lastDecision;
    const a = actionText(dec);
    if (a) return { state: 'known', text: a, why: '', basis: 'last-decision', action: dec.action, reason: dec.reason || '' };
    // 没有决策记录：把「今天排了活」当作「做了什么」的最低依据（排班是真事实，不是猜的）
    const my = booked.filter(function (x) { return x && !x.absent; });
    if (my.length) {
      const tasks = my.map(function (x) { return txt(x.task, 30); }).filter(Boolean);
      const uniq = tasks.filter(function (v, i) { return tasks.indexOf(v) === i; });
      if (uniq.length) return { state: 'known', text: '今天排了「' + uniq.slice(0, 2).join('」「') + '」', why: '', basis: 'booking' };
    }
    // 读过 life、读过排班，两边都没有 ⇒ 确实没有结算记录。这不是「读不到」。
    return segNone('no-decision-yet');
  }
  /**
   * ③ 接下来要做什么。
   *   来源：goals 的 `next`（作者/引擎写下的下一步）> 活跃承诺 > 当天排班尚未说明的任务。
   *   `showNext` 关掉时**如实报 unreadable:switched-off**，不静默返回空 ——
   *   「玩家关了这一栏」与「他没有下一步」必须不同形。
   */
  function segNext(person, lifeOn, booked, cfg) {
    if (!cfg.showNext) return segUnreadable('switched-off');
    const life = person && person.life;
    // life 关着 / 此人没有 life 行 ⇒ 目标与承诺这两路**没有依据**，但排班那一波仍然成立
    //   （laborSchedule 是另一个 owner，与 life.enabled 无关）。所以这里**不**当场报
    //   unreadable：先看排班，排班也没有才回到 unreadable。两支必须分开 ——
    //   「人生安排这一路关了」与「今天确实没排事」是两件事。
    if (!life || !lifeOn) {
      const rest0 = booked.filter(function (x) { return x && !x.absent && !x.interruptedReason; });
      if (rest0.length) {
        const t0 = rest0.map(function (x) { return txt(x.task, 24) + (x.slot ? '（' + slotText(x.slot) + '）' : ''); });
        return { state: 'known', text: '接下来排了 ' + t0.slice(0, 2).join('、'), why: '',
          basis: 'booking', note: lifeOn ? 'no-life-row' : 'life-off' };
      }
      return segUnreadable(lifeOn ? 'no-life-row' : 'life-disabled');
    }
    const goals = (Array.isArray(life.goals) ? life.goals : []).filter(function (g) { return g && g.status === 'active'; });
    const withNext = goals.filter(function (g) { return txt(g.next, 40); });
    if (withNext.length) return { state: 'known', text: '接下来' + txt(withNext[0].next, 40), why: '', basis: 'goal-next' };
    if (goals.length) return { state: 'known', text: '接下来还惦记着「' + txt(goals[0].text, 30) + '」', why: '', basis: 'goal-text' };
    const cs = (Array.isArray(life.commitments) ? life.commitments : []).filter(function (c) { return c && c.status === 'active'; });
    if (cs.length) return { state: 'known', text: '接下来要兑现「' + txt(cs[0].text, 30) + '」', why: '', basis: 'commitment' };
    const rest = booked.filter(function (x) { return x && !x.absent && !x.interruptedReason; });
    if (rest.length) {
      const t = rest.map(function (x) { return txt(x.task, 24) + (x.slot ? '（' + slotText(x.slot) + '）' : ''); });
      return { state: 'known', text: '接下来排了 ' + t.slice(0, 2).join('、'), why: '', basis: 'booking' };
    }
    return segNone('no-further-plan');
  }
  /** 时段中文：只做展示层映射，不改 laborSchedule 的封闭集合。 */
  function slotText(slot) {
    return ({ morning: '上午', afternoon: '下午', evening: '晚间', day: '白天' })[slot] || txt(slot, 10);
  }
  /** 把三段拼成一句人话；未知段**不占位**（不写「（无）」那种噪声）。 */
  function joinSegs(segs) {
    const parts = [];
    ['where', 'did', 'next'].forEach(function (k) {
      const s = segs[k];
      if (s && s.state === 'known' && s.text) parts.push(s.text);
    });
    return parts.join('；');
  }

  /**
   * 生成动线（**纯读**）。
   * @param {{who?:string|string[], maxPeople?:number}} opt
   * @returns {{ok, day, rows, lines, quiet, truncated, dropped, boundary, ...}}
   */
  function build(opt) {
    const cfg = settings();
    if (!cfg.enabled) {
      __stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled', day: null, rows: [], lines: [], quiet: false, line: '人物动线：未启用' };
    }
    const o = (opt && typeof opt === 'object') ? opt : {};
    const cap = Math.max(1, Math.min(8, num(o.maxPeople) || cfg.maxPeople));
    const sd = storyDay();
    const b = boundary();
    __stat.boundaryConsulted++;
    if (b.available) __stat.boundaryAvailable++;
    const now = safe(function () { return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('dayRoute') : null; }, null);
    const lifeOn = safe(function () {
      return !!(WA.life && typeof WA.life.getSettings === 'function' && WA.life.getSettings().enabled === true);
    }, false);

    const snap = safe(function () { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {}; }, {});
    const people = (snap && snap.people && typeof snap.people === 'object') ? snap.people : {};
    const dayBooked = sd.ok ? bookings(sd.day, '') : { ok: false, list: [], why: sd.why };

    // 人名单：先取「有 life 的」，再补「今天有排班的」——只取前者会漏掉纯排班的人，
    //   只取后者会漏掉有目标/承诺但没排班的人。两端都取才叫「今天的动线」。
    const names = [];
    Object.keys(people).forEach(function (k) {
      const p = people[k];
      if (!p || !p.life) return;
      const nm = txt(p.name, 30) || txt(k, 30);
      if (nm && names.indexOf(nm) < 0) names.push(nm);
    });
    (dayBooked.list || []).forEach(function (bk) {
      const nm = txt(bk && bk.who, 30);
      if (nm && names.indexOf(nm) < 0) names.push(nm);
    });

    const wanted = (function () {
      const w = o.who;
      if (!w) return null;
      const arr = Array.isArray(w) ? w : [w];
      return arr.map(function (x) { return txt(x, 30); }).filter(Boolean);
    })();
    const roster = (wanted ? names.filter(function (n) { return wanted.indexOf(n) >= 0; }) : names);
    const picked = roster.slice(0, cap);
    const dropped = roster.length - picked.length;

    const rows = [];
    let anyKnown = false;
    picked.forEach(function (nm) {
      const key = 'p_' + nm;
      const person = people[key] || (function () {
        // 排班里的人未必有 people 行（laborSchedule 允许只登记名字）。此时 person 为空，
        //   但三段仍要按「读了、确实没有」来答，而不是整人跳过。
        const hit = Object.keys(people).filter(function (k) { return txt(people[k] && people[k].name, 30) === nm; })[0];
        return hit ? people[hit] : null;
      })();
      __stat.peopleScanned++;
      const dom = scheduleDomain(person && person.life ? person.life.schedule : []);
      if (dom.state === 'absolute') __stat.scheduleAbsolute++;
      else if (dom.state === 'clock') __stat.scheduleClock++;
      else if (dom.state !== 'none') __stat.scheduleUnjudgeable++;
      const myBooked = (dayBooked.list || []).filter(function (x) { return txt(x && x.who, 30) === nm; });
      const segs = {
        where: segWhere(person, dom, now, b, { hidePlace: cfg.hidePlace }),
        did: segDid(person, lifeOn, myBooked),
        next: segNext(person, lifeOn, myBooked, cfg)
      };
      const line = joinSegs(segs);
      if (line) anyKnown = true;
      // 可见性计量三栏分开（判不了不混进「看不见」）
      // 四栏按 place/why 判，**不按措辞判**（措辞会改，why 是契约）：
      //   place 有值 ⇒ 点名；why 落在真·看不见那三支 ⇒ hidden；state!=='known' ⇒ 连事实都没有；
      //   其余（state==='known' 但 place 为空且 why 是判不了类）⇒ unjudgeable。
      //   五栏按 basis 判（契约字段），**不按措辞判**：
      //     known 点名 / hidden 真看不见 / suppressed 玩家要求不显示 / unjudgeable 判不了
      //     / unknown 连地点事实都没有。
      if (segs.where.state === 'known' && segs.where.place) __stat.whereKnown++;
      else if (segs.where.state !== 'known') __stat.whereUnknown++;
      else if (segs.where.basis === 'hidden') __stat.whereHidden++;
      else if (segs.where.basis === 'suppressed') __stat.whereSuppressed++;
      else __stat.whereUnjudgeable++;
      rows.push({ who: nm, segs: segs, line: line ? (nm + '：' + line) : '',
        scheduleDomain: dom.state, scheduleWhy: dom.why,
        scheduleSlots: clockSlots(dom) });
    });

    __stat.builds++;
    if (!rows.length) {
      // 一个人都扫不到：这不是「今天大家都没动线」，是**没有可读的人物面**。分开报。
      __stat.quietBuilds++; __stat.lastReason = 'no-people';
      return { ok: true, day: sd.day, dayReadable: sd.ok, dayWhy: sd.why,
        rows: [], lines: [], quiet: true, reason: 'no-people', truncated: false, dropped: 0,
        boundary: b, hint: '还没有可读的人物动线 —— 不是「今天谁都没动」，是人物面还没有生活记录',
        line: '人物动线：还没有可读的人物动线 —— 不是「今天谁都没动」，是人物面还没有生活记录' };
    }
    if (!anyKnown) {
      __stat.quietBuilds++; __stat.lastReason = 'quiet';
      return { ok: true, day: sd.day, dayReadable: sd.ok, dayWhy: sd.why,
        rows: rows, lines: [], quiet: true, reason: 'quiet', truncated: false, dropped: 0,
        boundary: b, hint: '今天这几个人的动线都读不到依据（不等于他们没有安排）',
        line: '人物动线：今天这几个人的动线都读不到依据（不等于他们没有安排）' };
    }
    const lines = rows.map(function (r) { return r.line; }).filter(Boolean);
    __stat.linesEmitted += lines.length;
    __stat.lastReason = 'built';
    return { ok: true, day: sd.day, dayReadable: sd.ok, dayWhy: sd.why,
      rows: rows, lines: lines, quiet: false, truncated: dropped > 0, dropped: dropped,
      boundary: b, cap: cap, total: roster.length,
      line: '人物动线：' + lines.join(' ') + (dropped > 0 ? '（另有 ' + dropped + ' 人未展开）' : '') };
  }
  function stat() {
    const cfg = settings();
    return {
      builds: __stat.builds, peopleScanned: __stat.peopleScanned, linesEmitted: __stat.linesEmitted,
      quietBuilds: __stat.quietBuilds,
      // 四栏覆盖全集：known（点名）/ hidden（真看不见）/ unjudgeable（事实在场但判不了可见性）
      //   / unknown（连地点事实都没有）。**判不了必须单列** —— 混进 known 会让
      //   「为什么一个地名都没念」永远答不出来；混进 hidden 会把「判不了」写成「看不见」。
      where: { known: __stat.whereKnown, hidden: __stat.whereHidden,
        unjudgeable: __stat.whereUnjudgeable, suppressed: __stat.whereSuppressed,
        unknown: __stat.whereUnknown },
      // 日程域三栏分开：absolute 能答此刻，clock 判不了此刻 —— 合并就再也答不出「为什么这一栏空」
      schedule: { absolute: __stat.scheduleAbsolute, clock: __stat.scheduleClock, unjudgeable: __stat.scheduleUnjudgeable },
      boundary: { consulted: __stat.boundaryConsulted, available: __stat.boundaryAvailable,
        fallback: __stat.boundaryFallback, via: boundary().via, why: boundary().why },
      lastReason: __stat.lastReason, faults: Object.assign({}, __stat.faults),
      sources: {
        life: !!(WA.life && typeof WA.life.getSettings === 'function'),
        lifeEnabled: !!(WA.life && typeof WA.life.getSettings === 'function' && WA.life.getSettings().enabled === true),
        laborSchedule: !!(WA.laborSchedule && typeof WA.laborSchedule.view === 'function'),
        boundaryOwner: !!(WA.worldDiary && typeof WA.worldDiary.boundary === 'function'),
        clock: !!(WA.clock && typeof WA.clock.now === 'function')
      },
      enabled: !!cfg.enabled, maxPeople: cfg.maxPeople, showNext: !!cfg.showNext, hidePlace: !!cfg.hidePlace
    };
  }
  function reset() {
    __stat.builds = 0; __stat.peopleScanned = 0; __stat.linesEmitted = 0; __stat.quietBuilds = 0;
    __stat.whereKnown = 0; __stat.whereHidden = 0; __stat.whereUnknown = 0;
    __stat.whereUnjudgeable = 0; __stat.whereSuppressed = 0;
    __stat.scheduleAbsolute = 0; __stat.scheduleClock = 0; __stat.scheduleUnjudgeable = 0;
    __stat.boundaryConsulted = 0; __stat.boundaryAvailable = 0; __stat.boundaryFallback = 0;
    __stat.lastReason = ''; __stat.faults = {};
    return true;
  }
  WA.dayRoute = {
    getSettings: settings, setSettings: saveSettings,
    build: build, stat: stat, reset: reset,
    boundary: boundary,
    // 扫描/判域两口导出**因为它们有真消费方**：专锁用它们做「判不了 vs 没有」的两向断言，
    //   面板诊断节直接展示 `scheduleDomain` 的四态。不是给未来留的入口。
    scheduleDomain: scheduleDomain, storyDay: storyDay,
    ACTION_TEXT: Object.assign({}, ACTION_TEXT), REASON_TEXT: Object.assign({}, REASON_TEXT),
    DEF: Object.assign({}, DEF)
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/day-route.js', { kind: 'engine', ver: '2.266.0' });
  }
  if (WA.log) WA.log('info', '人物动线已加载（只读聚合）');
})();
