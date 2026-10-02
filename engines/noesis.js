/**
 * WorldAxis engines/noesis.js (v2.141.0) — 防全知闸门（知情边界统一裁决）
 *
 * v2.141.0（F2）本版做四件事，全是**上一版声明了、却没有落点**的那一类缺口 ────────
 *   ① `srcIntel` 修形态误读（第三种）：`intel.visibleTo` 返回的是**数组**，
 *      初版按 `{known}/{ok}` 布尔对象读 ⇒ 该源恒返回 null ⇒ 在 intel 确有账的世界里，
 *      knows() 把「有账」读成「无账」（not-registered），而它该答 not-holder。
 *   ② `srcShadow` 修落地与注释矛盾（第四种）：注释写「未命中一律缺席」，代码写的是
 *      `rows.length ? has : null` ⇒ 此人名下有**任何**一条共同隐瞒，就把别的事判成「不知」。
 *      闸门于是从「少一票」变成「凭空多一票否决」。
 *   ③ 时点闸门：`premature` 从**只声明不产生**变成真判据。判据真源不新开，
 *      走 `intel.truthOf(about)` 的 `at`（worldFacts → memory.facts(active) → events → currents）
 *      与决策时间比一次。`timeEnabled` 由此第一次被真消费。
 *   ④ 感知第二轴：在场之后再看感知容量（lifeline.capacityOf + affect.loads 的疲劳/疼痛载荷）。
 *      新增独立码 `attenuated`（在场但没注意到），与 `out-of-range`（人不在场）严格分开。
 *   四件事共同的形态：**声明在注释/开关里，落点不在代码里**。本仓点名的招牌缺陷。
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   仓库已有六个信息不对称零件，各自都很硬，但都是「记账员」，没有一个在「正文生成前」
 *   当「守门员」：
 *     · enigma   记「秘密的知情名单」+ outsiders 越界核验 —— 但只答「已登记的秘密」，未登记的不拦；
 *     · intel    记「某人持有情报（来源+置信度）」—— 但只在**写入时**拦，不在**生成时**拦；
 *     · rumor    记传播链降级 —— 但只记传播，不裁决可见性；
 *     · masks    记假面结构（口径≠露馅）—— 但不阻止正文露馅；
 *     · probe    记证据对质 —— 只管调查卷宗；
 *     · shadow   记两人共同隐瞒 —— 只管秘密经历。
 *   rules.js 第 22/65 行有「知情路径铁律」，但那是给模型的**软约束**，没有引擎判据兜底。
 *   后果：模型要全知时，没有任何一个统一拦截点能当场拦住并归因——玩家眼看 NPC 说出它
 *   不可能知道的事，沉浸感当场崩。
 *
 * ── 本模块落点（一句话：把「该不该知道」从模型即兴变成引擎判据）────────────────
 *   ① \`knows(person, factId)\`  —— 统一裁决口：聚合六源，任一不知 ⇒ 答 false + 归因码；
 *   ② \`gateScene(persons, facts)\` —— 生成前闸门：返回 {allow, blocked[], reason[]}，只报不改正文；
 *   ③ \`leakScan(text, scene)\` —— 事后泄露扫描：检出「说出了 knows=false 的事实」⇒ 记 leak 留痕；
 *   外加 \`perceive(person, placeId)\`（感知半径）与 \`stat()\` / \`boundary()\`（只读计量与诊断面）。
 *
 * ── 一票否决（本模块最要紧的取舍）────────────────────────────────
 *   六源里**任一**判定「此人不知此事」，\`knows\` 就答 false，并把所有否决源的归因码逐条带出。
 *   为什么不取平均、不投票：「不知道」是不可逆的。一个角色一旦在正文里说出它不该知道的事，
 *   这次穿帮就无法被「另外五源都觉得它该知道」抵消。平均制会把「六源里有一源铁证它不知」
 *   稀释成「总体倾向知道」——那正是全知漏进来的缝。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 knows / gateScene / leakScan / perceive 一律拒收 \`disabled\`。
 *   2 **只读世界，不改世界**：本文件零 \`WA.store.transact\` / 零 \`WA.store.patch\`（源码级可核，
 *     专锁 N 面钉的就是这条）。leakScan 检出穿帮**只留痕不删文**——删文是叙事决定，不是引擎决定。
 *   3 **不自动改正文**：gateScene 只回答「哪些人不该知道哪些事」，把处置权交还作者/模型。
 *     自动改写会把作者的笔抢走（与 E11「只报不改」同一条纪律）。
 *   4 五个归因码**不可合并**：\`not-registered\`（没登记过）/ \`not-holder\`（登记了但此人不知）/
 *     \`out-of-range\`（空间不可达）/ \`premature\`（时间未到）/ \`attenuated\`（在场但没注意到）。
 *     合成一个「不知」，就再也答不出「是边界没划、人不在场、时辰未到，还是他没留意」——
 *     四种处置完全不同（补账 / 拦人 / 等时间 / 叫他一声）。
 *     v2.141.0（F2）如实登记：\`premature\` 在此版之前**只是这一句声明**——
 *     \`timeEnabled\` 在 DEF/boundary/stat 三处露脸却零消费方，\`docs/ERROR_CODES.md\` 里
 *     连它一行都没有；\`attenuated\` 是本版新开的第五码，它把边界 7 那句话变成可判定的。
 *   5 观测不得改变被观测对象：knows / gateScene / leakScan / perceive 是纯读（除 stat 计数），
 *     不落盘、不动世界状态、不触发挤出。
 *   6 事实真源不在本模块：\`factId\` 指向 memory.upsertFact 写下的那条；本模块只裁决「谁知道」，
 *     不写「发生了什么」。事实的唯一写者是 memory（与 rumor 边界 2 同源）。
 *   7 感知半径三态：在场 / 在场但削弱 / 不可达。**不可达不回落成在场**——「他不知道因为他不在场」
 *     与「他在场但没注意到」是两回事，合并就判不出该怪距离还是怪注意力。
 *     v2.141.0（F2）如实登记：这一句在 v2.140.0 里**只在注释里成立**（人在场就直接答 present）；
 *     本版补上第二轴（容量面 + 载荷面），削弱答 \`range:'impaired' / reason:'attenuated'\`。
 *
 * ── 拒收/归因码（沿用 v2.139.0 先例：能复用则复用，缺对应说法才新开）────────────
 *   复用：disabled / module-missing / bad-value / missing-fields。
 *   新开（语义在既有词表无对应、塌进既有码会丢归因）：
 *     not-registered  事实未登记（六源都没有这条账）
 *     not-holder      事实已登记，但此人不在任一知情面
 *     out-of-range    空间不可达（不在场且无传播/通讯路径）
 *     premature       时间未到（信息尚未产生就被引用）—— v2.141.0 起**有真产生方**
 *                     （timeGate：读 intel.truthOf 的 at 与决策时间比一次）
 *     attenuated      在场但没注意到（感知容量被病况/载荷削弱）—— v2.141.0 新开
 *     leak            事后扫描检出的人物越界发言（留痕码，非拒收码）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_noesis_settings_v1';
  const DEF = { enabled: false, rangeEnabled: true, timeEnabled: true, maxLeaks: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'noesis',
    bounds: { maxLeaks: [1, 32] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { knows: 0, allows: 0, denies: 0, gates: 0, leaks: 0, scans: 0, blocked: 0,
    // v2.141.0（F2）：premature 计数单列。**不与 denies 合并**——denies 是「人在界外」，
    //   premature 是「时辰未到」；合成一个读数就再也答不出该补划边界还是该等时间。
    premature: 0, perceiveIn: 0, perceiveOut: 0, perceiveUnknown: 0,
    lastReason: '', lastAt: 0, faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 80); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }

  // ── 六源查询面（每一面返回 null=缺席/不知 / true=该源认定知 / false=该源认定不知）────
  //   缺席（模块未加载或开关未开）与「认定不知」必须分开：缺席不计否决，认定不知才计。
  function srcEnigma(person, factId) {
    const e = WA.enigma; if (!e) return null;
    try {
      if (typeof e.outsiders === 'function') {
        // outsiders 答「这场里谁不该知道」：返回 {shouldKnow[], shouldNotKnow[]}。
        //   person 落在 shouldNotKnow ⇒ 该源认定不知（false）；落在 shouldKnow ⇒ 知（true）。
        const r = e.outsiders(factId, [person]);
        if (!r || r.ok !== true) return null; // 未登记的秘密（missing）⇒ 本面无账，不计否决
        const blind = r.shouldNotKnow || [];
        const seen = r.shouldKnow || [];
        if (blind.indexOf(person) >= 0) return false;
        if (seen.indexOf(person) >= 0) return true;
        return null;
      }
    } catch (err) { return null; }
    return null;
  }
  function srcIntel(person, factId) {
    const it = WA.intel; if (!it) return null;
    try {
      if (typeof it.visibleTo === 'function') {
        const r = it.visibleTo(person, factId);
        if (r == null) return null;
        if (typeof r === 'boolean') return r;
        // v2.141.0（F2）修一处真缺陷：`intel.visibleTo(person, subject)` 的**返回形态是数组**
        //   （实现是 `rows.filter(...).slice(-4)`），而初版按 `{known}` / `{ok}` **布尔对象**读
        //   ⇒ 两个 typeof 分支都不成立 ⇒ 这个源**永远返回 null**，从不投票。
        //   后果不是「少一票」，而是**把「有账」读成「无账」**：在 intel 确有账的世界里，
        //   knows() 答的是 `known:null + not-registered`（事实没登记过）——
        //   而它明明是「登记了、此人不在知情面」，该答 not-holder。
        //   与 v2.140.0 修掉的 srcRumor（在对象行数组上 indexOf 字符串，恒 -1）与
        //   srcShadow（把数组当 `{secrets}` 对象读）是**同一形态的第三例**。
        //   命中必须在**行上取键**。intel 行结构：
        //     { id, claim, source, level, confidence, about, status, at, from, to }
        //   其中 `about` 才是「这件事」的键（`id` 是这条账自己的编号，留一层兜底）。
        //   同族可用面：intel.rowsOf(person, about) / liveRows / entitledTo —— 本模块**不**改用它
        //   们，理由是 visibleTo 已把 `about` 过滤做掉、且它是这三个里唯一有「只取最近 4 条」
        //   语义的（与 buildBlock 的可见面同口径）；换用别的口会让闸门看到的账与模型看到的账
        //   不是同一份 —— 那正是本模块最不该出的错。
        const rows = Array.isArray(r) ? r : (r.rows || r.items || []);
        const has = rows.some(function (x) {
          return x && (x.about === factId || x.id === factId);
        });
        // 一张账都没有 ⇒ 本面无账（不冒充知情，也不冒充否决）；
        //   有账（且其中有/无这一条）⇒ 命中即知，未命中即认定不知。
        return rows.length ? has : null;
      }
    } catch (err) { return null; }
    return null;
  }
  function srcRumor(person, factId) {
    const r = WA.rumor; if (!r) return null;
    try {
      if (typeof r.visibleTo === 'function') {
        const v = r.visibleTo(person);
        if (!v || v.ok !== true) return null;   // 无账 / 被拒 ⇒ 本面无话可说，不计否决
        // visibleTo(person) 返回该人可见的**行**（每行形如 { id, factKey, layer, ... }）。
        //   v2.140.0（F1）修一处真缺陷：初版拿 factId 直接在行数组上 indexOf —— 那恒为 -1
        //   （字符串不可能等于对象），于是「这张账里没有你」被读成「认定你不知此事」。
        //   后者是一票否决，于是任何在这张账里有**别的**行的人，都会把「未登记的事」
        //   判成「登记了但此人不知」——正好把本模块最要紧的两码（not-registered /
        //   not-holder）合成一个。命中判据必须在**行上取键**，不在行数组上找字符串。
        const rows = v.rows || v.facts || v.items || [];
        const has = rows.some(function (x) {
          return x && (x.factKey === factId || x.id === factId || x.fact === factId);
        });
        const empty = !rows.length;
        // 这张账一行都没有 ⇒ 本面没账（不冒充「知情」也不冒充「否决」）；
        //   有账（且其中有/无这一条）⇒ 命中即知，未命中即认定不知。
        return empty ? null : has;
      }
    } catch (err) { return null; }
    return null;
  }
  function srcShadow(person, factId) {
    const s = WA.shadow; if (!s) return null;
    try {
      if (typeof s.visibleTo === 'function') {
        const v = s.visibleTo(person);
        if (v == null) return null;
        // shadow.visibleTo(person) 返回一个**数组**（每项是这人在场的共同隐瞒行，形如
        //   { pair, kind, stakes, ... }）——初版把它当成 { secrets } / { rows } 对象读，
        //   于是永远拿到空数组、这个源从来投不出票（静默失效：闸门少一票而无人知道）。
        //   同 v2.140.0 rumor 的修法：命中必须在**行上取键**；而且 shadow 的行以 pair/kind
        //   为键、不认 factId，所以「本面无这条账」只能答 null（缺席），不许冒充否决。
        const rows = Array.isArray(v) ? v : (v.rows || v.secrets || []);
        const has = rows.some(function (x) {
          return x && (x.pair === factId || x.kind === factId || x.factKey === factId);
        });
        // v2.141.0（F2）修同一形态的第四例（**与上一版注释自相矛盾的落地**）：
        //   上一版把这段注释写对了（「shadow 的行以 pair/kind 为键、不认 factId，
        //   所以『本面无这条账』只能答 null（缺席），不许冒充否决」），
        //   但**代码写的是 `rows.length ? has : null`** —— 只要此人名下有**任何**一条
        //   共同隐瞒行、且没有一条恰好等于这个 factId，它就答 `false`（否决）。
        //   后果与 intel 那处镜像对称：一个跟这桩事毫无关系的共同隐瞒，
        //   会把**任何**事实判成「此人不知」——闸门于是从「少一票」变成「凭空多一票否决」。
        //   正确的形态只有一种：shadow 的行不认 factId ⇒ 命中即知，**未命中一律缺席**。
        //   （能断言「知」是因为行上确实写着这人在场；断言不了「不知」，因为
        //     「这行不是这件事」推不出「此人不知这件事」——本模块最要紧的不可合并。
        //     这一条也是「注释说对了、代码没做到」的现场：判据必须落在代码上。）
        return has ? true : null;
      }
    } catch (err) { return null; }
    return null;
  }
  // masks / probe 不直接裁决「是否知道」——它们记的是「伪装结构」与「卷宗」，
  //   不是「知情面」。本模块只消费**记知情面**的源，不硬拉不相关的源凑数。

  const SRCS = [
    { key: 'enigma', fn: srcEnigma },
    { key: 'intel', fn: srcIntel },
    { key: 'rumor', fn: srcRumor },
    { key: 'shadow', fn: srcShadow }
  ];

  /**
   * 时点闸门（v2.141.0 F2）：这件事**此刻到底发生了没有**。
   *   为什么必须有它：本模块文件头自 v2.140.0 起就把 `premature`（时间未到）写进
   *   「四个归因码不可合并」的声明里，而 `timeEnabled` 也一直在 DEF / boundary / stat 三处露脸
   *   —— 但**全库没有一处产生它**：knows() 从不读 `timeEnabled`，
   *   `docs/ERROR_CODES.md` 里连 `premature` 这一行都没有。
   *   这正是本仓招牌缺陷形态「声明了消费口径、却没有产生方」（有说法、零落点）。
   *   判据的真源**不新开**：`intel.truthOf(about)` 是 v2.117.0（B3）就建好的
   *   「某事的真相」统一读口（worldFacts → memory.facts(active) → evolution.events → currents），
   *   它返回的 `at` 就是这件事**成立/发生**的时刻。本模块只做一件事：把它与决策时间比一次。
   *   三态严格分开（与全模块同一条纪律）：
   *     · 查不到这件事        ⇒ { known:false }（缺席，不冒充「未到」也不冒充「已发生」）
   *     · at 是未来时刻        ⇒ { premature:true, at }（**时间未到**）
   *     · at 缺失 / 不可比     ⇒ { premature:false, atKnown:false }（不拿缺数据当「未到」）
   *   边界：只读。不写任何容器，不改任何事实。
   */
  function timeGate(factId) {
    const cfg = settings();
    if (!cfg.timeEnabled) return { known: false, off: true };
    const it = WA.intel;
    if (!it || typeof it.truthOf !== 'function') return { known: false };
    let tr = null;
    try { tr = it.truthOf(factId); } catch (e) { return { known: false }; }
    if (!tr || tr.ok !== true) return { known: false };   // 这件事查不到 ⇒ 本面缺席
    const at = Number(tr.at);
    if (!isFinite(at) || at <= 0) return { known: true, premature: false, atKnown: false };
    const now = clockNow('noesis.time');
    return { known: true, premature: at > now, at: at, atKnown: true, source: tr.source };
  }

  /**
   * 统一裁决口：person 此刻是否知道 factId。
   *   一票否决：任一源认定不知 ⇒ known:false，并把每个否决源的归因码逐条带出。
   *   全源缺席/无账 ⇒ not-registered（事实没登记过，不拿「没拦」冒充「该知道」）。
   *   v2.141.0（F2）：时点闸门**先于**四源聚合 —— 一件事还没发生，谈不上谁知道它。
   *     顺序是硬约束：若把 premature 排在聚合之后，`deniedBy` 里会混进「某人不在知情面」
   *     这类**与时间无关**的否决源，于是「时辰未到」与「此人在界外」在读数上又合成一个
   *     —— 而这正是本模块最要紧的那条不可合并。
   */
  function knows(person, factId) {
    stat.knows++;
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const who = clean(person, 40), fid = clean(factId, 80);
    if (!who || !fid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    // ── 时点闸门（premature 的唯一产生方）──
    const tg = timeGate(fid);
    if (tg.premature === true) {
      stat.denies++; stat.premature = (stat.premature || 0) + 1;
      stat.lastReason = 'premature'; stat.lastAt = clockNow('noesis');
      return { ok: true, known: false, reason: 'premature', person: who, fact: fid,
        at: tg.at, deniedBy: ['premature'], knownBy: [] };
    }
    const deny = [], saw = [];
    let anySource = false;
    SRCS.forEach(function (s) {
      const v = s.fn(who, fid);
      if (v === null) return; // 该源缺席/无账，不计否决也不计知情
      anySource = true;
      if (v === false) deny.push(s.key); else saw.push(s.key);
    });
    if (deny.length) {
      stat.denies++;
      // 归因码取第一个否决源对应的语义；全部否决源的键名一并带出，不合并。
      return { ok: true, known: false, reason: 'not-holder', person: who, fact: fid,
        deniedBy: deny.slice(), knownBy: saw.slice() };
    }
    if (!anySource) {
      // 事实在六源里都没有账：不拿「没人拦」冒充「该知道」。
      return { ok: true, known: null, reason: 'not-registered', person: who, fact: fid, deniedBy: [], knownBy: [] };
    }
    stat.allows++;
    return { ok: true, known: true, reason: 'ok', person: who, fact: fid, deniedBy: [], knownBy: saw.slice() };
  }

  /**
   * 感知半径：person 对 placeId 处的发生是否可感知。三态：在场 / 可达 / 不可达。
   *   不可达 ⇒ out-of-range；**不回落成可达**。
   *   v2.141.0（F2）：在场**不等于**感知到了。文件头边界 7 写的是
   *   「『他不知道因为他不在场』与『他在场但没注意到』是两回事」——
   *   而 v2.140.0 的实现在人**在场**时直接答 `present` 就返回，
   *   上面那句话于是**只在注释里成立**（在场即感知，第二轴压根不存在）。
   *   本版把第二轴补成**可判定**的：在场之后再看这个人的**感知容量**——
   *   注意力/感官处理/认知/用药（lifeline.capacityOf）与感官状态载荷
   *   （affect.loads 的 fatigue/pain，与「鲜活世界·注意、感知与记忆」条目的
   *   「感知既受身体影响」同一条口径）。
   *   容量面**缺席≠无削弱**：「查不到」不许冒充「没事」，故 known:false 一律回落 present。
   *   削弱档 → `impaired`（reason 仍为 out-of-range 家族里的**独立码** `attenuated`），
   *   与「人根本不在场」（out）严格分开——两者处置完全不同：一个是走开，一个是叫他一声。
   */
  function perceive(person, placeId) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!cfg.rangeEnabled) return { ok: true, range: 'unknown', reason: 'range-off' };
    const who = clean(person, 40), pid = clean(placeId, 60);
    if (!who || !pid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    // ── 第一轴：空间可达（人不在场，什么都谈不上）──
    let at = null;
    try {
      if (WA.world && typeof WA.world.canBeAt === 'function') at = WA.world.canBeAt(who, pid);
    } catch (err) { at = null; }
    if (at && at.ok === true) {
      stat.perceiveIn = (stat.perceiveIn || 0) + 1;
      // ── 第二轴：感知容量（在场未必注意到）──
      const att = attenuationOf(who);
      if (att.impaired) {
        stat.perceiveUnknown = (stat.perceiveUnknown || 0) + 1;
        stat.lastReason = 'attenuated';
        return { ok: true, range: 'impaired', reason: 'attenuated', person: who, place: pid,
          via: att.via, band: att.band, load: att.load };
      }
      return { ok: true, range: 'present', person: who, place: pid, attenuated: false };
    }
    if (at && at.reason) {
      stat.perceiveOut = (stat.perceiveOut || 0) + 1;
      return { ok: true, range: 'out', reason: 'out-of-range', person: who, place: pid, via: at.reason };
    }
    stat.perceiveUnknown = (stat.perceiveUnknown || 0) + 1;
    return { ok: true, range: 'unknown', person: who, place: pid };
  }

  /**
   * 感知削弱（只读，**不新开真源**）：两处既有读数合成一档。
   *   ① lifeline.capacityOf(who)：病况带来的活动限制（cognition / sensory / medication / sleep
   *      / energy）—— band 为 heavy 即「此刻明显削弱」；
   *   ② affect.loads[who]：fatigue / pain 载荷合计 ≥ 5（其中任一 ≥ 3 单独成立）——
   *      与 affect 的过载阈值 6 同量级但**不是同一个阈值**：过载管的是情绪通道回退，
   *      这里管的是「注意不到」；两者混用会让「他很累」与「他没看见」合成一件事。
   *   缺失一律不削弱（缺席 ≠ 无能力，也 ≠ 有病）：查不到容量、没有载荷行，
   *   都 None 留给「未知」，绝不当成「削弱」或「正常」的既成结论。
   */
  function attenuationOf(who) {
    let band = 'none', via = null, load = null;
    try {
      if (WA.lifeline && typeof WA.lifeline.capacityOf === 'function') {
        const c = WA.lifeline.capacityOf(who);
        if (c && c.ok === true && c.known === true) {
          band = c.band;
          const keys = Object.keys(c.limits || {});
          const senseKeys = keys.filter(function (k) {
            return k === 'cognition' || k === 'sensory' || k === 'medication' || k === 'sleep' || k === 'energy';
          });
          if (band === 'heavy' || senseKeys.length >= 2) { via = 'lifeline.capacityOf'; }
        }
      }
    } catch (e) { /* 容量面缺席 ⇒ 本轴无话可说 */ }
    try {
      const st = state();
      const a = st && st.affect;
      const row = a && a.loads && a.loads[who];
      if (row && typeof row === 'object') {
        const f = Number(row.fatigue) || 0, p = Number(row.pain) || 0;
        load = f + p;
        if (load >= 5 || f >= 3 || p >= 3) via = via ? (via + '+affect.loads') : 'affect.loads';
      }
    } catch (e) { /* 载荷面缺席 ⇒ 本轴无话可说 */ }
    return { impaired: !!via, via: via, band: band, load: load };
  }

  /**
   * 生成前闸门：对一组人物 × 一组事实，给出「哪些人不该知道哪些事」。
   *   只报不改正文。返回 {ok, allow, blocked[], rows[]}；blocked 逐项带归因码。
   */
  function gateScene(persons, facts) {
    stat.gates++;
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const ps = Array.isArray(persons) ? persons : [];
    const fs = Array.isArray(facts) ? facts : [];
    if (!ps.length || !fs.length) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const blocked = [], rows = [];
    ps.forEach(function (p) {
      fs.forEach(function (f) {
        const r = knows(p, f);
        if (!r.ok) return; // disabled / missing-fields 已在 knows 内留痕
        rows.push({ person: r.person, fact: r.fact, known: r.known, reason: r.reason });
        if (r.known === false) blocked.push({ person: r.person, fact: r.fact, reason: r.reason, deniedBy: r.deniedBy });
      });
    });
    return { ok: true, allow: blocked.length === 0, blocked: blocked, rows: rows,
      persons: ps.length, facts: fs.length };
  }

  /**
   * 事后泄露扫描：在已生成正文里检出「人物说出了它 knows=false 的事实」。
   *   只留痕不删文。claims 形如 [{person, factId, uttered:true}]，uttered 为真才核。
   */
  function leakScan(claims, opts) {
    stat.scans++;
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const list = Array.isArray(claims) ? claims : [];
    const found = [];
    list.forEach(function (c) {
      if (!c || c.uttered !== true) return;
      const r = knows(c.person, c.factId);
      if (r.ok && r.known === false) {
        found.push({ person: r.person, fact: r.fact, reason: r.reason, deniedBy: r.deniedBy });
      }
    });
    if (found.length) {
      stat.leaks += found.length;
      stat.lastReason = 'leak';
      stat.lastAt = clockNow('noesis');
    }
    return { ok: true, leaks: found, count: found.length, scanned: list.length,
      truncated: found.length > settings().maxLeaks };
  }

  /** 诊断面（只读）：引擎现场 + 四码分布。零副作用——不跑 knows，不污染 stat。 */
  function boundary() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled, rangeEnabled: !!cfg.rangeEnabled, timeEnabled: !!cfg.timeEnabled,
      maxLeaks: cfg.maxLeaks,
      knows: stat.knows, allows: stat.allows, denies: stat.denies,
      // v2.141.0（F2）：四码分布**分开报**。premature 单列（时辰未到 vs 人在界外）；
      //   感知三态也分开（在场 / 在场但削弱 / 不可达），否则「他没注意到」与「他不在场」
      //   在读数上长得一样 —— 那正是本模块存在的理由。
      premature: stat.premature || 0,
      perceiveIn: stat.perceiveIn || 0, perceiveOut: stat.perceiveOut || 0,
      perceiveUnknown: stat.perceiveUnknown || 0,
      gates: stat.gates, scans: stat.scans, leaks: stat.leaks,
      blocked: stat.blocked, lastReason: stat.lastReason, lastAt: stat.lastAt,
      faults: Object.assign({}, stat.faults),
      sources: SRCS.map(function (s) { return { key: s.key, loaded: !!WA[s.key] }; })
    };
  }

  /**
   * 注入块（防全知纪律提示）：只输出**纪律**与**留痕计数**，绝不列具体事实名 ——
   *   列出事实名本身就是把未揭示剧情写进正文（v2.90.0 玩家/全知分列纪律：源名会暗示剧情）。
   *   关闭时返回空串（零 token 占用，与 craft「未开启时不额外约束」对齐）。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const lines = [];
    lines.push('【知情边界】以下每条只陈述纪律，不带任何具体秘密：');
    lines.push('· 每个角色只能依据它实际知道的演绎；不得让任何角色「全知」——');
    lines.push('  不在场、未被告知、无传播或通讯渠道的事，该角色一概不知。');
    if (stat.leaks > 0) lines.push('· 已留痕 ' + stat.leaks + ' 处疑似越界发言（细节见作者诊断面，不在此列名）。');
    return lines.join('\n');
  }

  WA.noesis = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    // 产品面四口：裁决 / 感知 / 生成前闸门 / 事后扫描 —— 每一口都有真消费方
    //   （注入链 noesis 源 / 面板人物页「知情边界」与「泄露扫描」按钮 / 诊断 secNoesis）。
    //   SRCS 内部查询面不导出（无独立消费方不挂）：要复核裁决走 knows() 的 deniedBy/knownBy
    //   与 boundary() 的 sources 段——那是可复算的读数，不是又一份实现。
    knows: knows, perceive: perceive, gateScene: gateScene, leakScan: leakScan,
    boundary: boundary, buildBlock: buildBlock,
    stat: function () {
      return Object.assign({}, stat, { faults: Object.assign({}, stat.faults),
        enabled: settings().enabled, rangeEnabled: settings().rangeEnabled, timeEnabled: settings().timeEnabled });
    }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/noesis.js', { kind: 'engine', ver: '2.141.0' });
})();
