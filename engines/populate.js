/**
 * WorldAxis engines/populate.js（v2.293.0 · V7 EXV7-9）— 一键播种：给这个世界种一批人。
 *
 * 【它治什么（立项原文，plans/V7_MASTER_PLAN.md）】
 *   空世界最痛的不是没机制，是没数据。V7 立项现场的六条硬读数里，第三条是
 *   「真实开局（town-workshop，people 6 / places 12）后非空 14」——
 *   也就是说 109 个带 buildBlock 的机制里，只有 14 个在有人有地方之后才出内容。
 *   而玩家从零开一局时，**连这 6 个人、12 个地方都没有**：先得自己去面板上一个一个
 *   点「加人物 / 加地点」，点够十几分钟，机制才肯说话。这条路在 V7 之前没有任何入口。
 *
 *   本项给的就是那个入口：选地区 + 人物数量 + 关系密度 + 势力数，
 *   按**真写口**批量种出一批可用的人、地点、路、关系、势力与目标。
 *
 * 【它不是一个「世界生成器」——四条硬纪律】
 *   ① **只走各引擎真写口**：`world.addPlace` / `world.addRoad` / `life.addGoal` /
 *      `bonds.setBond` / `org.grant` / `org.assignRole` / `editorFaction.add`，
 *      人物建档走**唯一写者** `registry.ensurePerson`（与 life/intel/backstage 同规）。
 *      本模块**零直写 store 字段**：唯一的 `store.transact` 是给 registry/editorFaction
 *      这两个「必须拿 draft 才肯写」的写口做的一次委托（它们内部各自不开事务）。
 *      直写会绕开各引擎自己的容量、挤出、记账与拒收 —— 那是本仓点名过的第二真源形态。
 *
 *   ② **不新建容器，容量全部复读既有登记**：本模块不新增任何 store 容器，
 *      因此**不进** `__BOUNDED_CAPS` / `evict SITES` 两张表（与 intake-dispatch 同款口径）。
 *      但「不新建容器」不等于「不占容量」：它要写进的五个容器**各自都有上限**——
 *      `people` 48 / `world.places` 24 / `world.roads` 40 / `evolution.factions` 16 /
 *      `bonds.rows` 24。上限的**单一真源是 `WA.evict.siteDecls()`**（core/evict 的 SITES 表，
 *      与 core/store 的 `__BOUNDED_CAPS` 逐键对账）。本模块**现场复读**它，绝不写死数字：
 *      写死一份就等于给「容器上限」造了第二个真源，改一处漏一处的那天，
 *      播种会在满容器上继续写、把真人挤出去，而调用方拿到 `{ok:true}`。
 *
 *   ③ **满则如实拒收，不静默挤掉既有真人**（`no-room`）：people / places / roads /
 *      factions / bonds 五张表全是**环形挤出**站点（`WA.evict.array/object`）。
 *      若本模块按「要几个就写几个」行事，超出的那几个人会被 evict **静默挤掉最旧的真人**
 *      —— 玩家看到的是「播了 8 个人，少了一个」，而那一个是他自己花十分钟填的。
 *      故写入侧先算余量：`min(要几个, 上限 - 已占)`，一个都不够写时如实报 `no-room`
 *      （带 `site` / `cap` / `used` / `need`），这与 diplomacy / storyChoice / freight
 *      等 7 个站点的写入侧硬上界是同一条口径。
 *
 *   ④ **可复现，且可复现性要说破**：所有随机量走 `core/rand` 的 `'populate'` 通道
 *      （`WA.rand.pick` / `WA.rand.int`），不碰 `Math.random`。世界种子在场时同一批参数
 *      播出来的就是同一批人；种子不在场时（`seeded:false`）本模块**如实报出**
 *      `reproducible:false` —— 「重播一次得到不同的人」与「参数没生效」在读数上长得一样，
 *      而处置完全相反（一个去设种子，一个去查参数）。
 *
 * 【为什么关系型一律「平行共存」、职阶一律从最低起（novice）】
 *   六型里「平行共存」有最弱的语义承诺：两人共存于同一地点，仅此而已；
 *   职阶里 `novice`（帮闲）是 `need: 0` 的那一档。播种不是叙事决策 ——
 *   此刻没有任何事件依据能支撑「这两人是替身 / 寄生拯救」，也没有任何贡献能支撑
 *   「此人是当家」（`chief` 要 `need: 120`，凭空给就是编一条履历）。
 *   挑一个更好看的型、给一个更高的职阶，就是把解读当事实写进世界。
 *   这两条**不是省事，是边界**，与 playable-seed 的同款决定逐字同源。
 *
 * 【实词从哪来（本模块唯一的「知识」，也因此是唯一要审的地方）】
 *   一键播种是**从零造世界**，必然要落具体名字 —— 这与 intake-dispatch 的
 *   「不编必填值」不冲突：那条禁的是把**推演契约里没有的值**编出来冒充推演结果。
 *   本模块的每一个实词必须能追到下面四张常量表之一（逐字可核）：
 *     · `SURNAME × GIVEN`  → 人名（16 × 12 = 192 组合，够 16 人上限，撞名即换）
 *     · `REGION`           → 地区根名
 *     · `PLACE_SEEDS`      → 地点名与 kind（六个枚举值与 world.js 的 PLACE_KINDS 同源）
 *     · `FACTION_SEEDS`    → 势力名 / 范围 / 目标；`PILLARS` → 支柱（五要件必需）
 *     · `TEMPLATE`         → 目标句式（占位符只允许填上面已落地的名字）
 *   专锁逐词核对这一条：任何一句目标文本切开后，每个实词都在上述表或已落地的名字里。
 *
 * 【导出面（7 口，每口都有真消费者）】
 *   getSettings / setSettings —— 设置页「一键播种」一格
 *   plan  —— 只算不写（面板「先看会播什么」按钮 + 诊断节）
 *   seed  —— 真播（面板「播种」按钮；诊断节不调它 —— 诊断面永不写世界）
 *   view  —— 读数（tool-diag 的 populate 节）
 *   stat  —— 分桶计数（拒因可数）
 *   reset —— 读数仪清零表
 */
(function () {
  'use strict';
  // 别名必须是**静态图认的**那一种形态（与 engines/driver-ledger.js 逐字同形）：
  //   tests/module-cycle-gate.js 的 ALIAS_RE 只认 `const X = (HOST.WorldAxis = HOST.WorldAxis || {})`。
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const LS_KEY = 'worldaxis_populate_settings_v1';
  const DEF = {
    enabled: true,        // 写面，但**入口是按钮**：没有任何自动触发点会调 seed()
    people: 8,            // 一批种几个人（受 people 容器余量约束）
    places: 6,            // 一批建几个地点（受 world.places 余量约束）
    roads: 5,             // 一批修几条路（受 world.roads 余量约束）
    factions: 2,          // 一批立几个势力（受 evolution.factions 余量约束）
    bondDensity: 50,      // 关系密度百分比：新人两两组合里取多少对（受 bonds.rows 余量约束）
    goalsPerPerson: 1,    // 每人写几条目标（life.addGoal 每人上限 8，本口远低于它）
    grantAmount: 20       // 每人发多少口粮（org.grant，正整数，0 = 不发）
  };
  // 区间全部闭区间、越界**夹取**而不是拒收（与 world-autobiography 同规：
  //   参数越界是「你要的太多」，不是「你不能要」；拒收会让面板滑块一动就红，把可用入口变成陷阱）。
  const __REG = { key: LS_KEY, def: DEF, module: 'populate',
    bounds: {
      people: [1, 16], places: [0, 12], roads: [0, 12], factions: [0, 4],
      bondDensity: [0, 100], goalsPerPerson: [0, 2], grantAmount: [0, 200]
    } };
  // filter + concat：同一 key 第二次装载不许在登记面留下两条（与 world-autobiography 同规）。
  WA.__settingsRegs = (WA.__settingsRegs || [])
    .filter(function (r) { return !r || r.key !== LS_KEY; }).concat([__REG]);

  // ── 本模块唯一的「知识」四张表 + 一张句式表（见文件头「实词从哪来」）──────────
  const SURNAME = ['沈', '陆', '顾', '苏', '许', '程', '温', '江', '裴', '谢', '宋', '白', '柳', '柯', '闻', '岑'];
  const GIVEN = ['清和', '砚秋', '知白', '见川', '栖迟', '云舒', '执之', '绥之', '玉藻', '望舒', '行止', '疏星'];
  const REGION = ['河东', '西塘', '南浦', '北岭', '云间', '石泉'];
  // kind 六个值与 engines/world.js 的 PLACE_KINDS 逐字同源（home/work/market/public/wild/sacred）——
  //   写成别的字符串会被 addPlace 以 bad-kind 拒收，那一条不是本模块能兜的。
  const PLACE_SEEDS = [
    { kind: 'home', name: '老宅' }, { kind: 'home', name: '西厢院' }, { kind: 'home', name: '瓦房' },
    { kind: 'work', name: '磨坊' }, { kind: 'work', name: '织坊' }, { kind: 'work', name: '窑场' },
    { kind: 'work', name: '木作' },
    { kind: 'market', name: '早市' }, { kind: 'market', name: '货栈' }, { kind: 'market', name: '粮行' },
    { kind: 'public', name: '渡口' }, { kind: 'public', name: '驿亭' }, { kind: 'public', name: '晒谷场' },
    { kind: 'public', name: '水井台' },
    { kind: 'wild', name: '后山' }, { kind: 'wild', name: '芦苇荡' }, { kind: 'wild', name: '荒滩' },
    { kind: 'sacred', name: '山神庙' }, { kind: 'sacred', name: '土地庙' }
  ];
  // 势力五要件（editorFaction.validate 逐项必需）：name / scope / currentGoal / powerPillars / core_person。
  //   core_person 在 plan 阶段填**本批第一个新人**（同 id 空间里的真名，不编造）。
  const FACTION_SEEDS = [
    { name: '同义社', scope: '河东一带', currentGoal: '把早市的秤统一了' },
    { name: '漕帮', scope: '水陆码头', currentGoal: '争下渡口的抽头' },
    { name: '义庄公所', scope: '镇内四邻', currentGoal: '筹一冬的义仓' },
    { name: '青禾行', scope: '周边田庄', currentGoal: '把粮价压回原样' }
  ];
  const PILLARS = ['码头', '田亩', '人望', '银钱', '香火'];
  const TEMPLATE = {
    goalSettle: '在{place}站住脚',
    goalServe: '替{faction}做事',
    goalMeet: '与{other}搭上线',
    note: '人名取本模块词表，地点取 PLACE_SEEDS，势力取 FACTION_SEEDS 并补五要件；'
      + '关系型一律「平行共存」、职阶一律「novice」—— 播种不替作者做剧情判断。'
  };

  const __stat = {
    runs: 0, plans: 0, planned: 0, written: 0, skipped: 0, blocked: 0,
    lastReason: '', reasons: {}, byKind: {}, seed: null
  };
  function note(reason) { __stat.reasons[reason] = (__stat.reasons[reason] || 0) + 1; __stat.lastReason = reason; }
  function noteKind(kind, ok) {
    const k = __stat.byKind[kind] || (__stat.byKind[kind] = { written: 0, skipped: 0, blocked: 0 });
    if (ok === true) k.written++; else if (ok === 'skip') k.skipped++; else k.blocked++;
  }
  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60)
      : String(v == null ? '' : v).trim().slice(0, max || 60);
  }
  function settings() {
    const raw = (WA.settingsBus && typeof WA.settingsBus.read === 'function')
      ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    return (WA.settingsBus && typeof WA.settingsBus.normalize === 'function')
      ? WA.settingsBus.normalize(__REG, merged) : merged;
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = (typeof WA.settingsBus.normalize === 'function')
        ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }
  function clampInt(v, lo, hi, fb) {
    if (v === null || v === undefined || v === '') return fb;
    const n = Number(v);
    if (!isFinite(n)) return fb;
    return Math.max(lo, Math.min(hi, Math.floor(n)));
  }
  /** 参数归一：设置面与调用参数合并后逐键夹取（越界夹取、不拒收，见 __REG 上方注释）。 */
  function norm(opts) {
    const b = Object.assign({}, settings(), opts || {});
    return {
      enabled: b.enabled !== false,
      people: clampInt(b.people, 1, 16, DEF.people),
      places: clampInt(b.places, 0, 12, DEF.places),
      roads: clampInt(b.roads, 0, 12, DEF.roads),
      factions: clampInt(b.factions, 0, 4, DEF.factions),
      bondDensity: clampInt(b.bondDensity, 0, 100, DEF.bondDensity),
      goalsPerPerson: clampInt(b.goalsPerPerson, 0, 2, DEF.goalsPerPerson),
      grantAmount: clampInt(b.grantAmount, 0, 200, DEF.grantAmount),
      region: clean(b.region, 40)
    };
  }
  function state() {
    try {
      return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
    } catch (e) { return {}; }
  }
  /**
   * 写口缺席清单。
   *   为什么逐口核而不是核命名空间：`WA.world` 在场、`addRoad` 不在场，是本仓常态
   *   （一半模块被裁剪或装错版本）。只核命名空间会把「有个空壳」当成「能写」。
   */
  function writesMissing() {
    const need = [
      ['store', WA.store, ['get', 'transact']],
      ['rand', WA.rand, ['pick', 'int']],
      ['world', WA.world, ['addPlace', 'addRoad']],
      ['life', WA.life, ['addGoal']],
      ['bonds', WA.bonds, ['setBond', 'read']],
      ['org', WA.org, ['grant', 'assignRole']],
      ['editorFaction', WA.editorFaction, ['add', 'list']],
      ['registry', WA.registry, ['ensurePerson']],
      ['evict', WA.evict, ['siteDecls']]
    ];
    const out = [];
    need.forEach(function (x) {
      const ns = x[1];
      if (!ns || typeof ns !== 'object') { out.push(x[0]); return; }
      const lack = x[2].filter(function (m) { return typeof ns[m] !== 'function'; });
      if (lack.length) out.push(x[0] + '.' + lack.join('/'));
    });
    return out;
  }
  /** 五个目标容器的**已占用量**（现场读，不缓存）。 */
  function usedOf(s) {
    const st = s || state();
    return {
      'people': (st.people && typeof st.people === 'object' && !Array.isArray(st.people))
        ? Object.keys(st.people).length : 0,
      'world.places': (st.world && Array.isArray(st.world.places)) ? st.world.places.length : 0,
      'world.roads': (st.world && Array.isArray(st.world.roads)) ? st.world.roads.length : 0,
      'evolution.factions': (st.evolution && Array.isArray(st.evolution.factions)) ? st.evolution.factions.length : 0,
      'bonds.rows': (st.bonds && Array.isArray(st.bonds.rows)) ? st.bonds.rows.length : 0
    };
  }
  /**
   * 余量：**复读既有上限登记**（core/evict 的 SITES 表 = __BOUNDED_CAPS 的单一真源）。
   *   读不到就返回 null —— 本仓口径：读不到上限 ≠ 上限无限。
   *   「上限读不到还照写」正是「容器满了却报 ok:true」的入口，那条路本项一次都不走。
   */
  function roomOf(site, used) {
    const decl = (WA.evict && typeof WA.evict.siteDecls === 'function') ? WA.evict.siteDecls() : null;
    const d = decl ? decl[site] : null;
    if (!d) return null;
    const cap = Number(d.cap);
    if (!isFinite(cap) || cap <= 0) return null;
    const u = (typeof used === 'number' && isFinite(used)) ? used : 0;
    return { site: site, cap: cap, used: u, free: Math.max(0, cap - u) };
  }
  function seedInfo() {
    let seeded = false, v = null;
    try {
      seeded = !!(WA.rand && typeof WA.rand.seeded === 'function' && WA.rand.seeded());
      v = (WA.rand && typeof WA.rand.getSeed === 'function') ? WA.rand.getSeed() : null;
    } catch (e) { seeded = false; v = null; }
    return { seeded: seeded, seed: (typeof v === 'string' || typeof v === 'number') ? v : null };
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = WA.rand.int(0, i, 'populate');
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /** 人名抽取：撞既有名或撞本批内已抽名即换（192 组合 ≫ 16 上限，不会有抽不出的情形）。 */
  function pickNames(n, taken) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 60 + 60) {
      const nm = WA.rand.pick(SURNAME, 'populate') + WA.rand.pick(GIVEN, 'populate');
      if (!nm || taken[nm] || out.indexOf(nm) >= 0) continue;
      out.push(nm);
    }
    return out;
  }
  function takenPeople(s) {
    const out = {};
    const ppl = (s && s.people && typeof s.people === 'object') ? s.people : {};
    Object.keys(ppl).forEach(function (k) {
      const p = ppl[k];
      if (p && typeof p === 'object' && p.name) out[p.name] = 1;
    });
    return out;
  }
  function takenPlaces(s) {
    const out = {};
    ((s && s.world && Array.isArray(s.world.places)) ? s.world.places : []).forEach(function (p) {
      if (p && p.name) out[p.name] = 1;
    });
    return out;
  }
  /**
   * 地区根：三级取法，逐级如实报来路（`regionSource`）。
   *   existing —— 玩家点了名且这个地点已登记，直接用
   *   created  —— 玩家点了名但没登记（或世界是空的），本批**先建它**
   *   为什么不允许「地区为空就随便挑一个既有地点当根」：那会把「镇上的渡口」
   *   变成「渡口镇」，而 addPlace 的 parent 一旦写错就 parent-locked 改不回来。
   */
  function planRegion(cfg, s) {
    const taken = takenPlaces(s);
    const asked = cfg.region;
    if (asked && taken[asked]) return { name: asked, source: 'existing' };
    if (asked) return { name: asked, source: 'created' };
    for (let i = 0; i < REGION.length; i++) {
      const cand = REGION[i] + '镇';
      if (!taken[cand]) return { name: cand, source: 'created' };
    }
    return null;   // 词表全部撞名（实际上是 6 个名字全在世上）——如实报不可定，不编第七个
  }
  /**
   * 计划（纯读，不写世界）。
   *   ⚠ 预览会**消耗随机序列**：它现场抽一份给你看。这不是缺陷，是随机源的正常行为 ——
   *   真播时按同一种子再抽，故「同一种子 ⇒ 同一批人」，而「预览的那一份」与
   *   「真播的那一份」在种子未在场时本就该不同。读数里 `reproducible` 把这件事说破。
   */
  function plan(opts) {
    const cfg = norm(opts);
    __stat.plans++;
    if (!cfg.enabled) {
      return { ok: false, reason: 'disabled', note: '一键播种关着（设置页可开）—— 这不是「世界已经满了」' };
    }
    const lack = writesMissing();
    if (lack.length) {
      return { ok: false, reason: 'writes-absent', missing: lack,
        note: '写口缺席：' + lack.join('、') + ' —— 拒绝在半套写面上播种（半套写面播出来的世界没法回滚）' };
    }
    const s = state();
    const used = usedOf(s);
    const rooms = {};
    Object.keys(used).forEach(function (k) { rooms[k] = roomOf(k, used[k]); });
    const roomLack = Object.keys(rooms).filter(function (k) { return rooms[k] === null; });
    if (roomLack.length) {
      return { ok: false, reason: 'writes-absent', missing: roomLack.map(function (k) { return 'evict.siteDecls[' + k + ']'; }),
        note: '容器上限读不到（' + roomLack.join('、') + '）—— 余量无从计算，拒绝「按感觉写」：'
          + '读不到上限时照写，就是容器满了还报 ok:true 的那条路' };
    }
    const region = planRegion(cfg, s);
    if (!region) {
      return { ok: false, reason: 'no-room', site: 'region-name', cap: null, used: null, need: 1,
        note: '地区词表六个名字在世上全部已登记 —— 不编第七个名字冒充新地区' };
    }
    // ── 地点：地区本身占一个名额（若需新建）──
    //    ⚠ 这个名额必须先在余量里扣掉：扣之前先问一句「还装得下吗」。
    //    不先问的直接后果是 will.places 记了个 1（地区根），而 world.places 其实
    //    一格都没有 —— 于是末尾那条「五容器全空」的守卫看得见 will.places=1 就放行，
    //    满世界被报成「能播 1 处」。这正是本项要治的病本身。
    const regionNeedsSlot = (region.source === 'created') ? 1 : 0;
    if (regionNeedsSlot && rooms['world.places'].free < 1) {
      return { ok: false, reason: 'no-room', site: Object.keys(rooms).filter(function (k) { return rooms[k].free === 0; }),
        rooms: rooms, cfg: cfg, region: region.name, regionSource: region.source,
        note: '地点容器已满，连地区根都放不下 —— 不是「参数错了」，是这个世界已经装满了' };
    }
    const placeFree = Math.max(0, rooms['world.places'].free - regionNeedsSlot);
    const takenP = takenPlaces(s);
    if (regionNeedsSlot) takenP[region.name] = 1;
    const pool = shuffle(PLACE_SEEDS.filter(function (x) { return !takenP[x.name]; }));
    const placeList = pool.slice(0, Math.min(cfg.places, placeFree, pool.length));
    // ── 道路：至少要有一个新地点才修得成（addRoad 要求两端都已登记）──
    const newPlaceCount = (region.source === 'created' ? 1 : 0) + placeList.length;
    const roadFree = rooms['world.roads'].free;
    const roadMax = (newPlaceCount >= 1) ? Math.min(cfg.roads, roadFree) : 0;
    // ── 人物 ──
    const peopleFree = rooms['people'].free;
    const names = pickNames(Math.min(cfg.people, peopleFree), takenPeople(s));
    // ── 势力：五要件里的 core_person 取本批第一个新人；一个新人也没有就不立势力 ──
    const factionFree = rooms['evolution.factions'].free;
    const factPool = shuffle(FACTION_SEEDS.filter(function (f) {
      return !((s.evolution && Array.isArray(s.evolution.factions)) ? s.evolution.factions : [])
        .some(function (x) { return x && clean(x.name, 40) === f.name; });
    }));
    const factionList = (names.length ? factPool.slice(0, Math.min(cfg.factions, factionFree)) : [])
      .map(function (f, i) {
        return { name: f.name, scope: f.scope, currentGoal: f.currentGoal,
          powerPillars: [PILLARS[i % PILLARS.length]], core_person: names[i % names.length] };
      });
    // ── 关系：新人两两组合按密度取前 k 对（上限受 bonds.rows 余量约束）──
    const pairAll = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) pairAll.push({ a: names[i], b: names[j] });
    }
    const pairWant = Math.floor(pairAll.length * cfg.bondDensity / 100);
    const pairs = shuffle(pairAll).slice(0, Math.min(pairWant, rooms['bonds.rows'].free))
      .map(function (p) { return { a: p.a, b: p.b, types: ['平行共存'] }; });
    // ── 目标：句式只填已落地的名字（place 取本批地点、faction 取本批势力、other 取另一人）──
    const goalPlace = placeList.length ? placeList.map(function (p) { return p.name; })
      : (region.source === 'existing' ? [region.name] : [region.name]);
    const goals = [];
    names.forEach(function (nm, i) {
      for (let k = 0; k < cfg.goalsPerPerson; k++) {
        if (k === 0) {
          goals.push({ person: nm, kind: 'settle',
            text: TEMPLATE.goalSettle.replace('{place}', goalPlace[i % goalPlace.length]) });
        } else if (factionList.length) {
          goals.push({ person: nm, kind: 'serve',
            text: TEMPLATE.goalServe.replace('{faction}', factionList[i % factionList.length].name) });
        } else if (names.length > 1) {
          const other = names[(i + 1) % names.length];
          if (other !== nm) goals.push({ person: nm, kind: 'meet', text: TEMPLATE.goalMeet.replace('{other}', other) });
        }
      }
    });
    // ── 汇总：要几个 vs 真能写几个（差额如实回带，不静默缩水）──
    const want = {
      places: cfg.places, people: cfg.people, roads: cfg.roads,
      factions: cfg.factions, bonds: pairWant,
      goals: cfg.people * cfg.goalsPerPerson, grants: cfg.people
    };
    const will = {
      places: newPlaceCount, people: names.length, roads: roadMax,
      factions: factionList.length, bonds: pairs.length,
      goals: goals.length, grants: names.length
    };
    const clamped = Object.keys(will).filter(function (k) { return will[k] < want[k]; });
    if (!will.places && !will.people && !will.roads && !will.factions && !will.bonds) {
      return { ok: false, reason: 'no-room', site: Object.keys(rooms).filter(function (k) { return rooms[k].free === 0; }),
        rooms: rooms, cfg: cfg, region: region,
        note: '五个容器全部没有余量 —— 不是「参数错了」，是这个世界已经装满了' };
    }
    return {
      ok: true, cfg: cfg, region: region.name, regionSource: region.source,
      rooms: rooms, used: used,
      want: want, will: will, clamped: clamped,
      names: names, places: placeList,
      roads: buildRoads(region, placeList, roadMax),
      factions: factionList, pairs: pairs, goals: goals,
      seed: seedInfo(),
      reproducible: seedInfo().seeded,
      note: TEMPLATE.note
    };
  }
  /**
   * 路网：先给每个新地点修一条到地区根的路（「走到镇上」是每条路的最小语义），
   *   余下的名额在新地点之间连。`minutes` 由随机源取 —— 它是地图属性，不是事实值。
   */
  function buildRoads(region, placeList, max) {
    const out = [];
    if (max <= 0 || !placeList.length) return out;
    const nodes = placeList.map(function (p) { return p.name; });
    for (let i = 0; i < nodes.length && out.length < max; i++) {
      out.push({ a: region.name, b: nodes[i], minutes: WA.rand.int(4, 45, 'populate') });
    }
    for (let i = 0; i < nodes.length && out.length < max; i++) {
      const j = (i + 1) % nodes.length;
      if (j === i) break;
      out.push({ a: nodes[i], b: nodes[j], minutes: WA.rand.int(4, 45, 'populate') });
    }
    return out.slice(0, max);
  }
  /** 写口调用的统一外壳：**任何写口抛错都不许逃逸**（逃逸会让 seed 半路中断、账本对不上）。 */
  function safe(fn, onErr) {
    try { return fn(); } catch (e) { return onErr(e); }
  }
  function ensurePerson(name) {
    let out = null;
    WA.store.transact(function (d) {
      out = WA.registry.ensurePerson(d, 'p_' + name, name, 'populate');
    }, 'populate:person');
    return out;
  }
  function addFaction(f) {
    let out = null;
    WA.store.transact(function (d) { out = WA.editorFaction.add(d, f); }, 'populate:faction');
    return out;
  }
  /**
   * 真播。按「地区 → 地点 → 道路 → 人物 → 势力 → 名册 → 关系 → 目标 → 资源」的次序：
   *   每一步都依赖前一步真落了地（parent 必须已登记 / core_person 必须是已建档的人 /
   *   名册只认在册者），故次序不是排版偏好，是正确性。
   *   每笔写**逐笔记账**（`rows`），拒了要能念出拒在哪 —— 不静默丢，也不把失败合成一句「播种失败」。
   */
  function yieldSnapshot() {
    const nonempty = [], faults = [];
    Object.keys(WA).forEach(function (key) {
      const m = WA[key];
      if (!m || typeof m.buildBlock !== 'function') return;
      try { const block = m.buildBlock(); if (typeof block === 'string' && block.trim()) nonempty.push(key); }
      catch (e) { faults.push({ key: key, error: String(e && e.message || e).slice(0, 120) }); }
    });
    return { count: nonempty.length, nonempty: nonempty.sort(), faults: faults };
  }
  let lastYield = null;
  function seed(opts) {
    __stat.runs++;
    const cfg = norm(opts);
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled', note: '一键播种关着（设置页可开）—— 这不是「世界已经满了」' }; }
    const lack = writesMissing();
    if (lack.length) { note('writes-absent'); return { ok: false, reason: 'writes-absent', missing: lack, note: '写口缺席：' + lack.join('、') }; }
    const p = plan(opts);
    if (!p.ok) { note(p.reason); return p; }
    const yieldBefore = yieldSnapshot();
    __stat.seed = p.seed;
    __stat.planned += Object.keys(p.will).reduce(function (a, k) { return a + p.will[k]; }, 0);
    const rows = [];
    const push = function (kind, name, r, via) {
      const ok = !!(r && r.ok === true);
      const reason = ok ? '' : ((r && r.reason) || 'unknown');
      if (ok) __stat.written++; else __stat.blocked++;
      noteKind(kind, ok ? true : false);
      if (!ok) note(reason);
      rows.push({ kind: kind, name: name, ok: ok, reason: reason, via: via || '', existed: !!(r && r.existed) });
      return ok;
    };
    // ① 地区根（source==='created' 时才真建；existing 时它已在 places 里）
    if (p.regionSource === 'created') {
      push('place', p.region, safe(function () {
        return WA.world.addPlace({ name: p.region, kind: 'public' });
      }, function () { return { ok: false, reason: 'write-threw' }; }), 'world.addPlace');
    }
    // ② 地点：全部挂在地区根下（addPlace 的 parent 要求先登记，故必然在 ① 之后）
    p.places.forEach(function (pl) {
      push('place', pl.name, safe(function () {
        return WA.world.addPlace({ name: pl.name, kind: pl.kind, parent: p.region });
      }, function () { return { ok: false, reason: 'write-threw' }; }), 'world.addPlace');
    });
    // ③ 道路
    p.roads.forEach(function (rd) {
      push('road', rd.a + '→' + rd.b, safe(function () {
        return WA.world.addRoad(rd.a, rd.b, rd.minutes);
      }, function () { return { ok: false, reason: 'write-threw' }; }), 'world.addRoad');
    });
    // ④ 人物建档（唯一写者 registry.ensurePerson；已存在即 skip，不重复占容量）
    const live = [];
    p.names.forEach(function (nm) {
      const r = safe(function () { return ensurePerson(nm); },
        function () { return { ok: false, reason: 'write-threw' }; });
      if (r && r.ok === true && r.isNew === false) {
        noteKind('people', 'skip');
        rows.push({ kind: 'people', name: nm, ok: true, reason: 'exists', via: 'registry.ensurePerson', existed: true });
        live.push(nm);
        return;
      }
      if (push('people', nm, r, 'registry.ensurePerson')) live.push(nm);
    });
    // ⑤ 势力（core_person 取已建档的人；没落成的人不许被写进 in册）
    const factLive = [];
    p.factions.forEach(function (f) {
      if (live.indexOf(f.core_person) < 0) {
        noteKind('faction', false);
        rows.push({ kind: 'faction', name: f.name, ok: false, reason: 'no-core-person', via: 'editorFaction.add', existed: false });
        note('no-core-person');
        __stat.blocked++;
        return;
      }
      if (push('faction', f.name, safe(function () { return addFaction(f); },
        function () { return { ok: false, reason: 'write-threw' }; }), 'editorFaction.add')) factLive.push(f.name);
    });
    // ⑥ 名册：一律 novice（need:0）—— 凭空给「当家」等于编一条履历（见文件头）
    factLive.forEach(function (fn, i) {
      live.forEach(function (nm, j) {
        if (j % Math.max(1, factLive.length) !== i) return;
        if (!WA.org.assignRole) return;
        push('roster', nm + '@' + fn, safe(function () {
          return WA.org.assignRole(fn, nm, 'novice');
        }, function () { return { ok: false, reason: 'write-threw' }; }), 'org.assignRole');
      });
    });
    // ⑦ 关系（一律「平行共存」；同一对已登记时 setBond 走 update，天然幂等）
    p.pairs.forEach(function (pr) {
      push('bond', pr.a + '×' + pr.b, safe(function () {
        return WA.bonds.setBond(pr.a, pr.b, pr.types);
      }, function () { return { ok: false, reason: 'write-threw' }; }), 'bonds.setBond');
    });
    // ⑧ 目标
    p.goals.forEach(function (g) {
      if (live.indexOf(g.person) < 0) return;
      push('goal', g.person, safe(function () {
        return WA.life.addGoal(g.person, { text: g.text, motive: 'settle' });
      }, function () { return { ok: false, reason: 'write-threw' }; }), 'life.addGoal');
    });
    // ⑨ 资源（口粮；0 = 不发，不发也要如实记一条 skip，否则「没发」与「发失败」同形）
    if (cfg.grantAmount > 0) {
      live.forEach(function (nm) {
        push('grant', nm, safe(function () {
          return WA.org.grant('person', nm, '口粮', cfg.grantAmount);
        }, function () { return { ok: false, reason: 'write-threw' }; }), 'org.grant');
      });
    }
    const blocked = rows.filter(function (x) { return x.ok !== true; }).length;
    const yieldAfter = yieldSnapshot();
    lastYield = { before: yieldBefore, after: yieldAfter,
      nondecreasing: yieldAfter.count >= yieldBefore.count,
      gained: yieldAfter.nonempty.filter(function (k) { return yieldBefore.nonempty.indexOf(k) < 0; }),
      lost: yieldBefore.nonempty.filter(function (k) { return yieldAfter.nonempty.indexOf(k) < 0; }),
      errors: yieldBefore.faults.length + yieldAfter.faults.length };
    lastYield.grew = yieldAfter.count > yieldBefore.count;
    lastYield.ok = lastYield.nondecreasing && lastYield.grew && lastYield.errors === 0;
    lastYield.verdict = lastYield.errors ? 'builder-fault' : !lastYield.nondecreasing ? 'regression' : !lastYield.grew ? 'no-growth' : 'grown';
    return {
      ok: true, region: p.region, regionSource: p.regionSource,
      yieldVerification: JSON.parse(JSON.stringify(lastYield)),
      written: rows.filter(function (x) { return x.ok === true; }).length,
      blocked: blocked,
      skipped: Object.keys(__stat.byKind).reduce(function (a, k) { return a + (__stat.byKind[k].skipped || 0); }, 0),
      rows: rows, byKind: Object.assign({}, __stat.byKind),
      planned: p.will, want: p.want, clamped: p.clamped,
      seed: p.seed, reproducible: p.reproducible,
      note: (blocked ? '有 ' + blocked + ' 笔没写成，逐笔见 rows（不合成一句「播种失败」）'
        : '全部落笔成功') + '；' + TEMPLATE.note
    };
  }
  function stat() {
    return {
      runs: __stat.runs, plans: __stat.plans, planned: __stat.planned,
      written: __stat.written, skipped: __stat.skipped, blocked: __stat.blocked,
      lastReason: __stat.lastReason, reasons: Object.assign({}, __stat.reasons),
      byKind: JSON.parse(JSON.stringify(__stat.byKind || {})),
      seed: __stat.seed, enabled: !!settings().enabled
    };
  }
  function view() {
    const cfg = settings();
    const s = state();
    const used = usedOf(s);
    const rooms = {};
    Object.keys(used).forEach(function (k) { rooms[k] = roomOf(k, used[k]); });
    const lack = writesMissing();
    return {
      ok: true, enabled: !!cfg.enabled, cfg: cfg,
      writesMissing: lack,
      writesPresent: lack.length === 0,
      used: used, rooms: rooms,
      // 三路「播不动」的原因分列：关着 / 写面不全 / 容器没余量 —— 合成一句就分不清该去改什么
      blockedWhy: (!cfg.enabled) ? 'disabled'
        : (lack.length ? 'writes-absent'
          : (Object.keys(rooms).some(function (k) { return rooms[k] && rooms[k].free === 0; }) ? 'no-room' : '')),
      seed: seedInfo(), stat: stat(), note: TEMPLATE.note,
      yieldVerification: lastYield ? JSON.parse(JSON.stringify(lastYield)) : null
    };
  }
  function reset() {
    __stat.runs = 0; __stat.plans = 0; __stat.planned = 0; __stat.written = 0;
    __stat.skipped = 0; __stat.blocked = 0; __stat.lastReason = '';
    __stat.reasons = {}; __stat.byKind = {}; __stat.seed = null; lastYield = null;
    return true;
  }
  WA.populate = {
    DEF: Object.assign({}, DEF),
    getSettings: settings, setSettings: saveSettings,
    plan: plan, seed: seed, view: view, stat: stat, reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/populate.js', { kind: 'engine', ver: '2.293.0' });
  }
  if (WA.log) WA.log('info', '一键播种已加载（真写口批量种人，满则如实拒收）');
})();
