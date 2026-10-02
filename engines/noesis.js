/**
 * WorldAxis engines/noesis.js (v2.144.0) — 防全知闸门（知情边界统一裁决）
 *
 * v2.144.0（F5）本版做一件事：把「记着 ≠ 记对」从**注释里的说法**变成**可判定的引擎闸门** ──
 *   缺口原句（`rumor.js` 边界 5）：「未声明的改写一律拒收……`intact` 仍是 true，而值已经不一样了」；
 *   以及它自己的记账面：`intact` / `tampered` / `drift` 三读数。
 *   实测：这三个读数**只有作者面消费方**（`ui/panel.js` 的链详情与 `tool-diag` 的计数），
 *   **裁决面（`knows` / `gateScene` / `buildBlock`）完全不知道「他记的是不是原版」** ——
 *   于是本闸门一路放行：一个只听过失真版本的人，`knows` 照样答 `known:true`，
 *   注入块照样告诉模型「该角色知道这件事」，角色随后把改写过的版本当既成事实写进正文。
 *   这是 F 线同型病（**声明在注释里，落点不在代码里**）的**第五例**。
 *   本版新增 `fidelity(person, factId)` 一口，三态如实：
 *     · `{known:false}`        这条链上没有此人 / 传播面缺席 ⇒ **不冒充「原版」**；
 *     · `{faithful:true}`      他接到的那一跳 `intact` 为真 ⇒ 手里是原版；
 *     · `{faithful:false, reason:'distorted', drift}` 他接到的是被改写过的版本。
 *   **一处必须写明的精度边界**：链级 `intact` 是**累积值**（一旦被改写就再也回不来），
 *   但「**这个人手里是哪一版**」要看**他接到的那一跳**的 `intact` ——
 *   拿链级累积值去答个人版本，会把「改写在传给他之后才发生」误判成「他手里的也变了」。
 *   两个真源不可合并：`knows` 答「知道吗」，`fidelity` 答「记的是原版吗」；
 *   与前四例同规 —— 人记岔了不等于他不知道，所以**不进 `knows` 的一票否决**。
 *
 * v2.143.0（F4）本版做一件事：把「在职 ≠ 在岗」从**注释里的说法**变成**可判定的引擎闸门** ──
 *   缺口原句（心之壁【职分】）：「有权查阅 ≠ 已经查阅」——一个角色有职位、有权查阅某份档案，
 *   不等于它此刻真的去查阅了（可能在休假、可能在别处、可能日程占满）。
 *   实测：仓库有三个零件（`inst.authority` 在职面 / `life.schedule` 日程面 /
 *   `world.canBeAt` 在场面），但**没有一个函数把三者合读**；`rules.js` 第 22/65 行有
 *   「知情路径铁律」，却是给模型的**软约束**、零引擎判据兜底 —— 与本模块前身
 *   （F1 防全知 / F2 时点 / F3 视角）是同一形态的第四例：**声明在注释里，落点不在代码里**。
 *   本版新增 `duty(person, orgId, at)` 一口，两码不合并：
 *     · `off-duty`      此人在职，但此刻被日程占住 / 不在该地 ⇒ 等排班、改日程；
 *     · `not-in-office` 此人压根不在职 ⇒ 先走任职流程，与上面完全不同的处置。
 *   两码**不进 knows() 的一票否决**：人下班了，知道的事不会忘掉——把它塞进 knows
 *   会把「他此刻在休假」读成「他不知道这件事」，那是另一种失真。两个真源不可合并：
 *   knows 答「知道吗」，duty 答「在岗吗」。
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
 *   4 七个归因码**不可合并**：\`not-registered\`（没登记过）/ \`not-holder\`（登记了但此人不知）/
 *     \`out-of-range\`（空间不可达）/ \`premature\`（时间未到）/ \`attenuated\`（在场但没注意到）/
 *     \`off-duty\`（在职但不在岗）/ \`not-in-office\`（压根不在职）。
 *     合成一个「不知」，就再也答不出「是边界没划、人不在场、时辰未到，还是他没留意」——
 *     四种处置完全不同（补账 / 拦人 / 等时间 / 叫他一声）；后两码（F4）同理分开：
 *     一个要改日程，一个要走任职流程。
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
 *     off-duty        在职但在岗面不成立（被日程占住 / 不在该地）—— v2.143.0 新开（duty）
 *     not-in-office   压根不在职（无任何在职职位）—— v2.143.0 新开（duty）
 *     leak            事后扫描检出的人物越界发言（留痕码，非拒收码）
 *
 * ── v2.143.0（F4）与既有四码的关系 ────────────────────────────
 *   `off-duty` / `not-in-office` **不进 knows() 的 deniedBy**（见 dutyGate 注释）：
 *   knows 答「知道吗」，duty 答「在岗吗」，是两个真源。它们只出现在 duty() 的返回与
 *   boundary() 的两条计数里，**不与 not-holder / out-of-range / premature 混报**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_noesis_settings_v1';
  // v2.143.0（F4）：`dutyEnabled` 是**在岗闸门**的总开关，与 `timeEnabled`（时点）/
  //   `rangeEnabled`（空间）并列成第三轴。三者各自可关：关掉一轴不是「放宽纪律」，
  //   而是**如实报这一轴缺席**（`duty-off` / `range-off`），与「查不到」严格分开。
  const DEF = { enabled: false, rangeEnabled: true, timeEnabled: true, dutyEnabled: true,
    // v2.144.0（F5）：`fidelityEnabled` 是**记忆失真面**的第四轴（与空间 / 时点 / 在岗并列）。
    //   关掉一轴不是「放宽纪律」，而是**如实报这一轴缺席**（`fidelity-off`）。
    fidelityEnabled: true, maxLeaks: 8 };
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
    // v2.143.0（F4）：在岗闸门两码**分开计**。off-duty（此人在职但此刻不在岗）
    //   与 not-in-office（此人根本不在职）处置不同——前者等排班，后者先任命；
    //   合成一个「没资格」就再也答不出该改日程还是该走任职流程。
    offDuty: 0, notInOffice: 0,
    // v2.144.0（F5）：失真面计数。`distorted` 记「读到的是被改写过的版本」的次数，
    //   与 denies 分开：denies 是「不该知道」，distorted 是「知道了但记岔了」——
    //   合成一个「有问题」就再也答不出该拦人还是该更正记录。
    distorted: 0,
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
   * 在岗闸门（v2.143.0 F4）：**在职不等于在岗**。
   *   为什么必须有它：本仓「谁有资格做这件事」有三个零件，但没有一个把三者合读 ——
   *     · `inst.authority(orgId, who)` 答「此人此刻在该组织任什么职、能拍什么板」（**在职面**）；
   *     · `life` 的 `schedule` 答「此人此刻的日程落在哪一段」（**在岗面**）；
   *     · `world.canBeAt(who, place)` 答「此人此刻在不在那个地方」（**在场面**）。
   *   三者各自都对，可「他在职 ⇒ 他能立刻履职」这句话在本仓库**无法表达**：
   *   职务是常驻属性，日程与在场是逐时属性；`inst.authority` 只看 `org.posts[].holder`，
   *   压根不读日程与在场，于是「有权查阅」被当成「已经查阅」。
   *   这正是 F 线同型病的第四例形态：**声明在注释里，落点不在代码里**
   *   （rules.js 第 22/65 行有「知情路径铁律」，但「在职 ≠ 在岗」这一句零判据）。
   *   判据真源**不新开**，只做一次合读：在职面缺席 ⇒ 本轴无话可说（不冒充「不在岗」）；
   *   在职且此刻不在岗/不在场 ⇒ `off-duty`；压根不在职 ⇒ `not-in-office`。两码不合并。
   *   三态严格分开（与全模块同一条纪律）：
   *     · 在职面缺席（inst 未加载 / 此人不在任何组织）⇒ { known:false }（**不冒充**「不在岗」）
   *     · 在职但此刻不在岗（日程冲突 / 已离场 / 不在该地）⇒ { onDuty:false, reason:'off-duty' }
   *     · 此人不在职 ⇒ { inOffice:false, onDuty:false, reason:'not-in-office' }
   *   边界：只读。不写任何容器，不改日程，不改任职。
   *   **为什么锚点是「组织」而不是「事实」**：本闸门答的是「他此刻在不在这个岗上」，
   *   而「在不在岗」与「问的是哪件事」无关——它只取决于**哪个组织的岗**。
   *   若把 factId 塞进签名，就逼本模块从「事实」反推「这事归哪个组织管」，
   *   那是猜组织归属（本仓禁止的形态）。故签名取 `(person, orgId, at)`，
   *   与文档原稿的 `(person, factId, at)` 有意不同，此处如实登记差异。
   *   **为什么不进 knows() 的一票否决**：`off-duty` 推翻的是「他正在履职」，
   *   不是「他知道」——人下班了，知道的事不会忘掉。把它塞进 knows 会让
   *   「他此刻在休假」被读成「他不知道这件事」，那是另一种失真。
   *   两个真源不可合并：knows 答「知道吗」，duty 答「在岗吗」。
   */
  function dutyGate(person, orgId, at) {
    const cfg = settings();
    // 总开关与第三轴**两道闸都要过**（与 knows / perceive / gateScene 同规）：
    //   总开关关闭 ⇒ 一律拒收 disabled（不是「查不到在岗」，也不是「不在岗」）；
    //   第三轴单独关闭 ⇒ 如实报 duty-off（这一轴缺席，不是「他在岗」）。
    if (!cfg.enabled) return { known: false, reason: 'disabled' };
    if (!cfg.dutyEnabled) return { known: false, off: true, reason: 'duty-off' };
    const who = clean(person, 40), oid = clean(orgId, 60);
    if (!who) return { known: false };
    const inst = WA.inst;
    if (!inst || typeof inst.authority !== 'function') return { known: false };
    let au = null;
    try { au = inst.authority(oid, who); } catch (e) { return { known: false }; }
    if (!au || au.ok !== true) return { known: false };   // 组织查不到 ⇒ 本面缺席
    if (au.inOffice !== true) {
      // 压根不在职：**不回落成「在岗」**，也不与「在职但不在岗」合并。
      stat.notInOffice = (stat.notInOffice || 0) + 1;
      stat.lastReason = 'not-in-office'; stat.lastAt = clockNow('noesis');
      return { known: true, inOffice: false, onDuty: false, reason: 'not-in-office',
        posts: [], who: who, org: oid };
    }
    // 在职。再看此刻在不在岗：日程冲突（life.schedule）与在场（world.canBeAt）两读合成一档。
    const t = isFinite(Number(at)) ? Number(at) : clockNow('noesis.duty');
    let offReason = null, place = null;
    try {
      const st = state();
      const p = (st.people || {})['p_' + who];
      const lf = p && p.life;
      const sch = lf && Array.isArray(lf.schedule) ? lf.schedule : [];
      // 日程面：命中一条 active 且覆盖此刻的日程 ⇒ 他在别处（本组织之外的事）。
      //   日程不记「属于哪个组织」——那会逼本模块猜组织归属（本仓禁止）。故口径为：
      //   此刻被**任一**日程占住 ⇒ 报 off-duty，并把该日程的 activity 带出，由调用方判断。
      const hit = sch.filter(function (x) {
        return x && x.status === 'active' && isFinite(Number(x.start)) && isFinite(Number(x.end))
          && t >= Number(x.start) && t < Number(x.end);
      })[0];
      if (hit) { offReason = 'scheduled'; place = hit.activity || null; }
    } catch (e) { /* 日程面缺席 ⇒ 本读无话可说 */ }
    if (!offReason) {
      // 在场判据只在**调用方给了地点**时生效：不给地点就不拿「他不在某地」冒充「他不在岗」。
      const pid = clean(place, 40);
      if (pid && WA.world && typeof WA.world.canBeAt === 'function') {
        try {
          const at2 = WA.world.canBeAt(who, pid, t);
          if (at2 && at2.ok === false && (at2.reason === 'closed' || at2.reason === 'window-too-short')) {
            offReason = 'place-closed';
          }
        } catch (e) { /* 在场面缺席 ⇒ 本读无话可说 */ }
      }
    }
    if (offReason) {
      stat.offDuty = (stat.offDuty || 0) + 1;
      stat.lastReason = 'off-duty'; stat.lastAt = clockNow('noesis');
      return { known: true, inOffice: true, onDuty: false, reason: 'off-duty',
        via: offReason, posts: au.posts || [], perms: au.perms || [], who: who, org: oid, at: t };
    }
    return { known: true, inOffice: true, onDuty: true, reason: 'on-duty',
      posts: au.posts || [], perms: au.perms || [], who: who, org: oid, at: t };
  }

  /**
   * 记忆失真面（v2.144.0 F5）：**这个人手里拿的是不是原版**。
   *
   * 与 `knows` 的分工是硬的：`knows` 答「知道吗」，本口答「记的是原版吗」。
   *   **不进 knows 的一票否决** —— 人记岔了不等于他不知道；把它塞进 knows 会让
   *   「他听到的是被改过的版本」被读成「他不知道这件事」，那是另一种失真。
   *
   * 判据真源**不新开**：只读 `rumor` 已经记下的链（`factKey` / `hops[].to` / `hops[].intact` / `value`），
   *   本模块不重算「传了几手」、更不自己造一份版本。
   *
   * 三态如实（**问不出来 ≠ 问出来是原版**）：
   *   · 传播面缺席 / 没有这条链 / 此人不在链上 ⇒ `{known:false}`，不冒充「原版」；
   *   · 他接到那一跳 `intact` 为真 ⇒ `{known:true, faithful:true, reason:'faithful'}`；
   *   · 他接到那一跳 `intact` 为假 ⇒ `{known:true, faithful:false, reason:'distorted'}`，
   *     并带出 `drift {from,to}`（**由调用方处置**：更正 / 对质 / 让它继续错下去都是叙事决定）。
   *
   * 两道前置闸（与 duty / perceive 同规）：总开关关 ⇒ `disabled`；
   *   第四轴关 ⇒ `fidelity-off`（**如实报这一轴缺席**，不是「他记的是原版」）。
   */
  function fidelityGate(person, factId) {
    const cfg = settings();
    if (!cfg.enabled) return { known: false, reason: 'disabled' };
    if (!cfg.fidelityEnabled) return { known: false, faithful: null, reason: 'fidelity-off' };
    const who = clean(person, 40), fid = clean(factId, 80);
    if (!who || !fid) return { known: false, reason: 'missing-fields' };
    const r = WA.rumor;
    if (!r) return { known: false };   // 传播面缺席 ⇒ 本面无话可说，不冒充「原版」
    let c = null;
    try {
      const ch = (state().rumor || {}).chains;
      c = (Array.isArray(ch) ? ch : []).filter(function (x) {
        return x && (x.factKey === fid || x.id === fid);
      })[0];
    } catch (e) { return { known: false }; }
    if (!c) return { known: false };   // 没有这条链 ⇒ 缺席（不是「原版」，也不是「失真」）
    const hops = Array.isArray(c.hops) ? c.hops : [];
    // **本面只答「经手过的人」**：没接到过这条链的人，谈不上「他手里是哪一版」。
    const recv = hops.filter(function (h) { return h && h.to === who; });
    if (!recv.length) return { known: false, who: who, fact: fid, reason: 'not-on-chain' };
    const last = recv[recv.length - 1];
    const from = String(c.factValue == null ? '' : c.factValue);
    const to = String(last.value == null ? '' : last.value);
    if (last.intact === true) {
      return { known: true, faithful: true, reason: 'faithful', who: who, fact: fid,
        chain: c.id, layer: last.layer, value: to, hops: hops.length };
    }
    // 失真：**只报不改**（更正记录是叙事决定，不是引擎决定——与 leakScan「只留痕不删文」同规）。
    stat.distorted = (stat.distorted || 0) + 1;
    stat.lastReason = 'distorted'; stat.lastAt = clockNow('noesis');
    return { known: true, faithful: false, reason: 'distorted', who: who, fact: fid,
      chain: c.id, layer: last.layer, via: last.motive, value: to,
      drift: (to === from) ? null : { from: from, to: to }, hops: hops.length };
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
      // v2.143.0（F4）：在岗两码**分开报**（在职但不在岗 / 压根不在职），
      //   与「时辰未到」「人不在场」并列成第三轴的读数——四种处置各不相同。
      offDuty: stat.offDuty || 0, notInOffice: stat.notInOffice || 0,
      dutyEnabled: !!cfg.dutyEnabled,
      // v2.144.0（F5）：失真面读数。`distorted` 与 denies **分开报**——
      //   「他记岔了」与「他不该知道」处置不同（更正记录 vs 拦住发言）。
      distorted: stat.distorted || 0,
      fidelityEnabled: !!cfg.fidelityEnabled,
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
    // v2.143.0（F4）：在岗纪律。**只在有账时提**——零在岗账时不占 token（与全模块同口径）。
    //   只输出纪律，不列组织名/人名（列出即把未揭示的任职关系写进正文）。
    if (cfg.dutyEnabled && (stat.offDuty > 0 || stat.notInOffice > 0)) {
      lines.push('· 在职不等于在岗：有职位、有权查阅，都不等于此刻人在岗、已履职；');
      lines.push('  此刻被日程占住、已离场、或不在该地的人，不得当作正在办事。');
    }
    // v2.144.0（F5）：记忆失真纪律。**只在有账时提**（零账零 token，与全模块同口径）。
    //   只输出纪律，不列事实名/人名（列出即把未揭示的失真写进正文）。
    if (cfg.fidelityEnabled && stat.distorted > 0) {
      lines.push('· 记着不等于记对：有人「知道」的是被改写过的版本；');
      lines.push('  凡经转述得知的事，不得当作亲眼所见或既成事实复述。');
    }
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
    // v2.143.0（F4）：在岗闸门。真消费方三处（与其余各口同规格，缺一不挂）：
    //   ① 注入链：buildBlock 的「在岗纪律」段（模型据此知道「在职不等于在岗」）；
    //   ② 面板：人物页「在岗核查」按钮（wa-noe-duty）；
    //   ③ 诊断：secNoesis 的 offDuty / notInOffice 两码读数。
    duty: dutyGate,
    // v2.144.0（F5）：记忆失真面。真消费方三处（与其余各口同规格，缺一不挂）：
    //   ① 注入链：buildBlock 的「记忆失真纪律」段；
    //   ② 面板：人物页「记忆失真核查」按钮（wa-noe-fidelity）；
    //   ③ 诊断：secNoesis 的 distorted 读数 + fidelityEnabled 第四轴开关位。
    fidelity: fidelityGate,
    boundary: boundary, buildBlock: buildBlock,
    stat: function () {
      return Object.assign({}, stat, { faults: Object.assign({}, stat.faults),
        enabled: settings().enabled, rangeEnabled: settings().rangeEnabled,
        timeEnabled: settings().timeEnabled, dutyEnabled: settings().dutyEnabled,
        fidelityEnabled: settings().fidelityEnabled });
    }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/noesis.js', { kind: 'engine', ver: '2.144.0' });
})();
