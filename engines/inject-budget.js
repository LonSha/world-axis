/**
 * WorldAxis engines/inject-budget.js (v0.9.3) — 注入预算裁判（纯计算，不自行注入）
 * 缝合来源：SoulLink 上下文预算 + DlSNlGHT World 注入块分级 + WNE 负载裁切
 *
 * 解决的问题：
 *   inject.js 目前把所有可见源无条件拼接落地，长局后（势力/事件/伏笔/主观记忆累积）
 *   注入块会吃掉大量上下文。本引擎在落地前做一次「预算裁决」：
 *   - pinned（核心，rank<=2）：优先保障，绝不静默丢弃（除非自身就超预算，才从末位截断）
 *   - optional（rank>=3）  ：按优先级填充，预算不足则先折叠（段落截断）再丢弃
 *
 * 与 tool-analyzer 的关系：analyzer 只报负载，不做决策；本引擎做决策，但只返回计划，
 * 落地仍由 inject.js 执行（单一落地入口不变）。
 *
 * 纯函数式：不读 store、不写配置、不落地注入。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const DEFAULT_BUDGET = 2400;      // 默认注入预算（token 粗估）
  const MIN_KEEP_TOKENS = 40;       // 低于此值不再保留（折叠后仍太小则丢弃）
  const FOLD_FLOOR_TOKENS = 30;     // 折叠下限
  const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

  /**
   * 源优先级：rank 越小越重要；fold=true 允许超预算时折叠。
   *
   * v2.85.0 A4：本表此前只有 v0.9.3 的 8 个源名，而注入面已长到 46 个 push 点 ——
   *   于是 38 个源**全部静默落 DEFAULT_RANK**，「pinned 优先保障、绝不静默丢弃」
   *   这条承诺只对 2 个源成立，且「有源没被声明」在运行时不可见。
   *   现按**可替代性**补满：越靠前＝越不可替代（丢一条，模型就再也看不到那件事）。
   *   判据由 tests/settle-v2851.js 承担：真代码面里每个 `source: 'X'` 都必须在本表内，
   *   且未声明者会经 plan().unranked / summaryText 当场报出（成类锁，防再次漂移）。
   */
  const PRIORITY = {
    // rank 1-2：pinned，绝不静默丢弃
    '近端事件': { rank: 1, fold: false },
    '世界状态': { rank: 2, fold: false },
    // rank 3：丢了就断因果/记忆主链
    '主观记忆': { rank: 3, fold: true },
    '因果结算': { rank: 3, fold: true },
    // rank 4：长期记忆本体
    '记忆': { rank: 4, fold: true },
    // rank 5：世界骨架与叙事摘要
    '叙事摘要': { rank: 5, fold: true },
    '世界织体': { rank: 5, fold: true },
    '人物生活': { rank: 5, fold: true },
    '因果与情报': { rank: 5, fold: true },
    // v2.96.0（X3）：传播面与「因果与情报」同档——它决定模型笔下哪些是「亲眼见」、
    //   哪些是「听说」。落 rank 6+ 就等于在最需要分寸的地方允许被随手折叠。
    '传开的与亲眼见的': { rank: 5, fold: true },
    // v2.99.0（第五十六面）：原著幕目。**与「因果与情报」「传开的与亲眼见的」同档**——
    //   它答的是「原著里本该长什么样、现在演到哪一段」，与「这件事传开没传开」是同一层的
    //   叙事基准。落 rank 6+ 等于允许基准被随手折叠：基准一丢，「已偏离原著哪一段」就答不出，
    //   而它恰恰是原著向玩法唯一的地基。
    '原著幕目': { rank: 5, fold: true },
    // v2.128.0（收口 · 补 X2 的漏登记）：世界编年史。**与「记忆」同档（rank 4）**——
    //   它答的是「此前发生过什么」（已结算归档的事实），与长期记忆本体是同一层的地基；
    //   落 rank 6+ 等于允许「该发生过什么」被随手折叠 —— 而「此前发生过什么」正是所有后续
    //   裁决与叙事的基准（折叠掉它，模型就只剩当前这一刻）。
    '世界编年史': { rank: 4, fold: true },
    '事件调度': { rank: 5, fold: true },
    // rank 6：推演与结构性面
    '世界推演': { rank: 6, fold: true },
    '资源与组织': { rank: 6, fold: true },
    '长线伏笔': { rank: 6, fold: true },
    // v2.135.0（E6）：伏笔台账。与「长线伏笔」同层（rank 6）——
    //   两者答的是同一件事的两面：longline 报「过了承诺时刻仍没收」，
    //   foreshadow 报「埋下但尚未兑现」。丢了不至于断主链，但「答应过什么」会从上下文里消失。
    '伏笔台账': { rank: 6, fold: true },
    '悬案': { rank: 6, fold: true },
    '社交漩涡': { rank: 6, fold: true },
    '场外事件': { rank: 6, fold: true },
    '情绪通道': { rank: 6, fold: true },
    '关系六型': { rank: 6, fold: true },
    '时间锁': { rank: 6, fold: true },
    '双层性格': { rank: 6, fold: true },
    '资料片周期': { rank: 6, fold: true },
    '生存三轴': { rank: 6, fold: true },
    '情境切片': { rank: 6, fold: true },
    '竞争焦点': { rank: 6, fold: true },
    '信息暗礁': { rank: 6, fold: true },
    '风险账': { rank: 6, fold: true },
    // rank 7：物候/环境/氛围类（可被上下文替代）
    '账本': { rank: 7, fold: true },
    '天气与物候': { rank: 7, fold: true },
    '世界难度': { rank: 7, fold: true },
    '假面': { rank: 7, fold: true },
    '好感审计': { rank: 7, fold: true },
    '通缉': { rank: 7, fold: true },
    '阻尼量规': { rank: 7, fold: true },
    '节奏齿轮': { rank: 7, fold: true },
    '伏笔配给': { rank: 7, fold: true },
    '焦点分配': { rank: 7, fold: true },
    '业力账': { rank: 7, fold: true },
    '叙事工艺': { rank: 7, fold: true },
    // rank 8：最可替代（统计/库存/外观/账目类）
    '舆情': { rank: 8, fold: true },
    '驯兽': { rank: 8, fold: true },
    '外貌契约': { rank: 8, fold: true },
    '原型阶梯': { rank: 8, fold: true },
    '边际折旧': { rank: 8, fold: true },
    '手段耐受': { rank: 8, fold: true },
    '快照与分支': { rank: 8, fold: true },
    // v2.119.0（优化③ / 承接拓展八条）：八个新引擎的注入源，外加上一批的「人物行动」。
    //   为什么必须逐个登记：只加注入分支不加本表 ⇒ 九源全部静默落 DEFAULT_RANK(6)，
    //   「pinned 优先保障、绝不静默丢弃」这条承诺对它们不成立，且运行时不可见。
    //   现按可替代性补满：人物行动与事件调度同层（丢了就断了「谁这轮做了什么」）；
    //   关系修复/组织制度/调查卷宗属推演与结构性面；供需与商路/远方/玩法进度/多人场
    //   是最可替代的一翼（缺了不至于断主链）。
    '人物行动': { rank: 5, fold: true },
    '人物计划': { rank: 6, fold: true },
    '关系修复': { rank: 6, fold: true },
    '组织制度': { rank: 6, fold: true },
    '调查卷宗': { rank: 6, fold: true },
    '供需与商路': { rank: 7, fold: true },
    '远方': { rank: 7, fold: true },
    '玩法进度': { rank: 7, fold: true },
    '多人场': { rank: 7, fold: true },
    // v2.129.0（缝 A1/A4/A5/A6/A8）：五个新注入源的优先级。
    //   用户锁定答「这一轮玩家不许模型碰什么」——它是硬约束而非氛围，落 rank 5：与「人物行动」
    //   「原著幕目」同层，丢一条就等于允许约束被随手折叠，而折叠掉它模型会直接违反玩家明示的边界。
    //   节奏环/文体档案/信息迷雾/战力锚四者属「叙事分寸与设定基准」，与「双层性格」「情境切片」
    //   同层（rank 6）：丢了不至于断主链，但会让文章的松紧、用词与设定锚点一起漂。
    '用户锁定': { rank: 5, fold: true },
    '节奏环': { rank: 6, fold: true },
    '文体档案': { rank: 6, fold: true },
    '信息迷雾': { rank: 6, fold: true },
    '战力锚': { rank: 6, fold: true },
    // v2.130.0（拓展计划 A4 / C2）：两条新注入源的优先级。
    //   思考开销答「这一轮正文必须落地成篇」——它直接关系产出有无，落 rank 5：
    //   与「用户锁定」「人物行动」同层，折叠掉它模型会拿空正文交差。
    //   剧情倾向属「长线分寸」，与「双层性格」「情境切片」同层（rank 6）：
    //   丢了不至于断主链，但走向会漂。
    '思考开销': { rank: 5, fold: true },
    '剧情倾向': { rank: 6, fold: true },
    // v2.140.0（F1）：防全知闸门。与「信息暗礁」「假面」同层（rank 6）——它答的是
    //   「这个人此刻该不该知道这件事」，是信息暗礁那条线的守门面；丢了不至于断主链，
    //   但模型会重新凭「全知」落笔（这正是它要治的病）。漏登记会由
    //   tests/settle-v2851.js 的 C1 成类锁当场报出 unranked。
    '知情边界': { rank: 6, fold: true },
    // v2.141.0（F2）：生理与照护真实层。落 rank 5，与「生存三轴」「情绪通道」同层 ——
    //   它答的是「这个人此刻带着什么状况、限制哪些活动」，属**身体与在场条件**：
    //   折叠掉它，模型会重新写出「病危→痊愈」与「诊断即时完成」那类失真。
    //   漏登记会由 tests/cost-v2880.js 的成类锁当场报出 unranked。
    '生理与照护': { rank: 5, fold: true },
    // v2.142.0（F3）：视角锁。与「信息暗礁」「知情边界」同层（rank 6）——
    //   它答的是「这一笔该不该由这个视角写」，是知情边界那条线的**视角维**；
    //   丢了不至于断主链，但模型会重新按全知落笔（这正是它要治的病）。
    //   漏登记会由 tests/cost-v2880.js 的成类锁当场报出 unranked。
    '视角锁': { rank: 6, fold: true },
    // v2.151.0（RX2+RX3）：两条新注入源的优先级。**同时补上 v2.149.0 的存量缺口** ——
    //   `此地沉积` 在 v2.149.0 加源时漏登本表（settle-v2850 的 C1 成类锁实测已红 2 条），
    //   漏登的后果是它静默落 DEFAULT_RANK，让「pinned 优先保障、绝不静默丢弃」这条
    //   承诺对它不成立且运行时不可见。本版一并补上，不新开面。
    //   三者的档位理由：
    //     · 你不在时 —— 答「这段时间世界变成了什么样、哪些没许动」，是**玩家缺席期的
    //       唯一交代**；折叠掉它，回来时世界凭空多了几件事而读者看不懂（叙事断层）。落 rank 5：
    //       与「叙事摘要」「世界编年史」同层（都是「此前发生过什么」的地基）。
    //     · 远方的脉搏 —— 答「你不在的地方此刻在发生什么」，属环境与氛围层；
    //       落 rank 7（与「远方」「天气与物候」同层：缺了不至于断主链，可由上下文替代）。
    //     · 此地沉积 —— 与「世界编年史」是同一桩事的地点视角投影，落 rank 5（同层而非更轻）。
    '你不在时': { rank: 5, fold: true },
    '远方的脉搏': { rank: 7, fold: true },
    '此地沉积': { rank: 5, fold: true },
    // v2.154.0（RX4）：世界联网面的优先级。落 rank 7，与「远方的脉搏」「远方」「天气与物候」同层 ——
    //   它答的是「别的世界传过来什么」（带来源标注、且明确禁止当成本地事实），
    //   属**环境与氛围**层：缺了不至于断主链，可由上下文替代。
    //   为什么不与「远方的脉搏」并档：一个答「你不在的地方此刻在发生什么」（本世界内），
    //   一个答「**别的世界**的事」——把两者并成一档，「本地远方」与「世界之外」就分不开了。
    //   漏登记会由 tests/cost-v2880.js 的成类锁当场报出 unranked。
    '远方的传说': { rank: 7, fold: true },
    // v2.165.0（TX1）：势力外交事实面。落 rank 5，与「组织制度」「用户锁定」「生理与照护」同层 ——
    //   它答的是「**谈成了什么约、到几号到期**」，是成对势力间的既成约定（承诺已生效）；
    //   折叠掉它，模型会把「两家有约」写回「两家没关系」，已生效的条约凭空失效（这正是它要治的病）。
    //   为什么不落 rank 6/7：环境氛围层的源「缺了不至于断主链」，而已生效条约是后续剧情的
    //   **裁决基准**（谁欠谁、什么可以做）——丢了基准，违约与履约就都无从谈起。
    //   漏登记会由 tests/cost-v2880.js 的成类锁当场报出 unranked。
    '外交事实': { rank: 5, fold: true },
    // v2.166.0（TX2）：行动调度面。落 rank 4，与「人物生活」「人物多步计划」「人物行动」同层 ——
    //   行动闭环是推演驱动面，它决定「谁该做什么、做完了没」。
    '行动调度': { rank: 4, fold: true },
    // v2.167.0（TX3）：守恒运输面。落 rank 5，与「外交事实」「组织制度」「用户锁定」同层 ——
    //   在途货运是后续供需结算的裁决基准。
    '货运在途': { rank: 5, fold: true },
    '故事分支': { rank: 5, fold: true },
    '委托履约': { rank: 5, fold: true },
    '线索调查': { rank: 5, fold: true },
    '地点后果': { rank: 5, fold: true },
    '运营结算': { rank: 5, fold: true }
  };
  const DEFAULT_RANK = 6;

  // ══════════════════ v2.88.0 O1：注入成本实测与分档 ══════════════════
  /**
   * 成本分档：短 / 中 / 长 三档（按单源构建耗时归类）。
   *   为什么必须分档而不只报一个总数：本模块早已报「用了多少 token」，而耗时这一维
   *   从未被测量过——「注入慢在哪、慢在谁身上」在治理面上完全不可答。
   *   分档按人机交互尺度切：≤2ms 无感、≤16ms 一帧内、再往上用户能感知。分档纯属解释面，不参与任何判定（不因慢而丢源）。
   */
  const COST_BANDS = [
    { band: 'short', maxMs: 2, note: '无感' },
    { band: 'medium', maxMs: 16, note: '一帧内' },
    { band: 'long', maxMs: Infinity, note: '引人注意' }
  ];
  /** 单次耗时归类（纯函数；非法/负值一律归 short，不抛、不返 undefined）。 */
  function costOf(ms) {
    const v = (typeof ms === 'number' && isFinite(ms) && ms > 0) ? ms : 0;
    const r = Math.round(v * 100) / 100;
    for (let i = 0; i < COST_BANDS.length; i++) {
      if (v <= COST_BANDS[i].maxMs) return { band: COST_BANDS[i].band, ms: r, note: COST_BANDS[i].note };
    }
    return { band: 'short', ms: r, note: COST_BANDS[0].note };
  }
  /**
   * 科目表：源显示名 → { account, role }。
   *   分档回答「慢不慢」，科目回答「这笔时间花在哪一类事上」——同样是 30ms，花在
   *   「世界骨架」与花在「账目与观测」上的处置方向完全不同（前者动不得，后者可降级）。
   *   名称以注入项的 source 字面量为准（与 render/inject.js 一致）；表外源归「未归类」
   *   并由 costView().unclassified 当场报出——它是成类锁：源面新增而此处漏登记会红灯。
   */
  const ACCOUNTS = {};
  //   v2.88.0 O1：**逐个登记全部 45 源**（与 PRIORITY 同一名单）。为什么必须全覆盖：
  //   只登记少数几个会让绝大多数源落在「未归类」上，那这个科目表就只是装饰；
  //   全覆盖之后 `costView().unclassified` 才恢复到它真正的含义——**源面长了而表没跟上**。
  //   本表由 tests/cost-v2880.js 的 C1 成类锁盯着：PRIORITY 的键集必须被 ACCOUNTS 逐字盖住。
  //   v2.119.0：增至 54 源（补拓展八条引入的九个源）；C1 覆盖仍是逐字比键集，不靠计数。
  [
    // 世界骨架：注入的根（世界是什么样）——缺了它不是「少一块」而是「舞台没了」
    ['世界状态', '世界骨架', '承载'], ['世界织体', '世界骨架', '承载'],
    ['世界推演', '世界骨架', '推进'], ['时间锁', '世界骨架', '承载'],
    // 人物与关系：在场的人是谁、与玩家什么关系、记忆里有什么
    //   注：「人物此刻」不作为独立注入项存在（它并进『世界状态』文本），故不入表。
    ['人物生活', '人物与关系', '承载'],
    ['关系六型', '人物与关系', '承载'], ['情绪通道', '人物与关系', '承载'],
    ['双层性格', '人物与关系', '承载'], ['假面', '人物与关系', '承载'],
    ['记忆', '人物与关系', '承载'], ['主观记忆', '人物与关系', '承载'],
    ['好感审计', '人物与关系', '计量'], ['社交漩涡', '人物与关系', '推进'],
    ['原型阶梯', '人物与关系', '计量'], ['驯兽', '人物与关系', '计量'],
    ['外貌契约', '人物与关系', '呈现'],
    // 叙事推进：剧情往前走的那些线（因果 / 事件 / 伏笔 / 节奏）
    ['因果结算', '叙事推进', '承载'], ['因果与情报', '叙事推进', '承载'],
    ['传开的与亲眼见的', '叙事推进', '承载'],
    ['原著幕目', '叙事推进', '承载'],
    ['叙事摘要', '叙事推进', '承载'], ['事件调度', '叙事推进', '推进'],
    ['场外事件', '叙事推进', '推进'], ['长线伏笔', '叙事推进', '推进'],
    // v2.135.0（E6）：伏笔台账。与 PRIORITY 同批登记 —— tests/cost-v2880.js 的
    //   A1/A2/B7 成类锁盯着「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集。
    ['伏笔台账', '叙事推进', '推进'],
    ['悬案', '叙事推进', '推进'], ['资源与组织', '叙事推进', '推进'],
    ['情境切片', '叙事推进', '推进'], ['竞争焦点', '叙事推进', '推进'],
    ['信息暗礁', '叙事推进', '推进'], ['伏笔配给', '叙事推进', '计量'],
    ['节奏齿轮', '叙事推进', '计量'], ['焦点分配', '叙事推进', '计量'],
    ['阻尼量规', '叙事推进', '计量'],
    // 环境与氛围：可被上下文替代的那一层
    ['天气与物候', '环境与氛围', '氛围'], ['资料片周期', '环境与氛围', '氛围'],
    ['生存三轴', '环境与氛围', '承载'], ['世界难度', '环境与氛围', '计量'],
    ['通缉', '环境与氛围', '计量'], ['风险账', '环境与氛围', '计量'],
    ['业力账', '环境与氛围', '计量'], ['边际折旧', '环境与氛围', '计量'],
    ['手段耐受', '环境与氛围', '计量'],
    // 账目与观测：账本与呈现面（时间花在这里，多半是为了「让人看见」）
    ['账本', '账目与观测', '计量'], ['舆情', '账目与观测', '计量'],
    ['快照与分支', '账目与观测', '计量'], ['叙事工艺', '账目与观测', '呈现'],
    // v2.119.0（承接拓展八条）：八个新引擎的注入源 + 人物行动。
    //   与 PRIORITY 同批登记——回指 tests/cost-v2880.js 的 B7 / C1 成类锁：
    //   源面新增而此处漏登记 ⇒ unclassified 当场报出（不静默归其它）。这不是装饰，
    //   它保证「这笔时间花在哪类事上」在源面增长后仍然答得出。
    ['人物行动', '叙事推进', '推进'],
    ['人物计划', '叙事推进', '推进'],
    ['关系修复', '人物与关系', '推进'],
    ['组织制度', '叙事推进', '推进'],
    ['调查卷宗', '叙事推进', '推进'],
    ['供需与商路', '环境与氛围', '推进'],
    ['远方', '环境与氛围', '氛围'],
    ['玩法进度', '账目与观测', '计量'],
    ['多人场', '账目与观测', '计量'],
    // v2.128.0（收口 · 补 X2 的漏登记）：世界编年史。与 PRIORITY 同批登记 ——
    //   tests/cost-v2880.js 的 B7 / C1 成类锁盯着「真注入链上无未归类源」，
    //   源面新增而此处漏登记会当场红灯（而不是静默归入「其它」）。
    ['世界编年史', '叙事推进', '承载'],
    // v2.129.0（缝 A1/A4/A5/A6/A8）：五个新注入源的科目。与 PRIORITY 同批登记 ——
    //   tests/cost-v2880.js 的 A1/A2/B7 成类锁盯着「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集。
    ['用户锁定', '世界骨架', '承载'],
    ['节奏环', '叙事推进', '推进'],
    ['文体档案', '叙事推进', '承载'],
    ['信息迷雾', '叙事推进', '承载'],
    ['战力锚', '环境与氛围', '计量'],
    // v2.130.0（拓展计划 A4 / C2）：两条新注入源的科目。与 PRIORITY 同批登记 ——
    //   tests/cost-v2880.js 的 A1/A2/B7 成类锁盯着「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集。
    ['思考开销', '叙事推进', '承载'],
    ['剧情倾向', '叙事推进', '承载'],
    // v2.140.0（F1）：防全知闸门的科目。与 PRIORITY 同批登记 —— tests/cost-v2880.js 的
    //   A1/A2/B7 成类锁盯着「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集；
    //   它答的是「谁此刻知道什么」，与「信息暗礁」同属人物与关系面的承载项。
    ['知情边界', '人物与关系', '承载'],
    // v2.141.0（F2）：生理与照护真实层的科目。与 PRIORITY 同批登记 —— tests/cost-v2880.js 的
    //   A1/A2/B7 成类锁盯着「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集。
    //   与「生存三轴」同属身体面的承载项（一个记值与档，一个记持续与限制）。
    ['生理与照护', '人物与关系', '承载'],
    // v2.142.0（F3）：视角锁的科目。与 PRIORITY 同批登记 —— tests/cost-v2880.js 的
    //   A1/A2/B7 成类锁盯着「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集。
    //   与「信息暗礁」「知情边界」同属叙事推进面的承载项（同一桩事的三个面：
    //   谁知道 / 谁在场 / 这笔由谁的视角交代）。
    ['视角锁', '叙事推进', '承载'],
    // v2.151.0（RX2+RX3）：两条新源的科目 + v2.149.0 漏登记的补给。
    //   与 PRIORITY 同批登记 —— tests/cost-v2880.js 的 A1/A2/B7 成类锁盯着
    //   「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集（条目数必须与源面数相等）。
    //   归类口径：「你不在时」是叙事推进面的承载项（它答「此前发生过什么」）；
    //   「远方的脉搏」是承载项而非氛围项 —— 它念的是**具体哪里的哪桩事**（带失真标注），
    //   不是气候式的氛围修饰；「此地沉积」与「世界编年史」同属叙事推进面的承载项。
    ['你不在时', '叙事推进', '承载'],
    ['远方的脉搏', '叙事推进', '承载'],
    ['此地沉积', '叙事推进', '承载'],
    // v2.154.0（RX4）：世界联网面的科目。与 PRIORITY 同批登记 ——
    //   tests/cost-v2880.js 的 A1/A2/B7 成类锁盯着「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集。
    //   归「环境与氛围 / 承载」（与「远方的脉搏」同科）：它念的是**别处的事**，不是本地的推进；
    //   但它带具体内容（哪件事、来自哪个世界），故是承载项而非氛围修饰。
    ['远方的传说', '环境与氛围', '承载'],
    // 一次性：本轮消费即清（不进长期账）
    ['近端事件', '账目与观测', '一次性'],
    // v2.165.0（TX1）：势力外交事实面。与 PRIORITY 同批登记 —— tests/cost-v2880.js 的
    //   A1/A2 成类锁盯着「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集。
    //   归「叙事推进」而非「人物与关系」：它答的是势力间约定的进展（条约生效/到期/履约），
    //   与「组织制度」同属**群体间的推进**，不是两个人之间的私关系。
    ['外交事实', '叙事推进', '承载'],
    ['行动调度', '叙事推进', '承载'],
    // v2.167.0（TX3）：守恒运输面。与 PRIORITY 同批登记 —— tests/cost-v2880.js 的
    //   A1/A2 成类锁盯着「源面 ⇄ PRIORITY ⇄ ACCOUNTS」三者逐字同键集。
    ['货运在途', '叙事推进', '承载'],
  ['故事分支', '叙事推进', '承载'],
  ['委托履约', '叙事推进', '承载'],
  ['线索调查', '叙事推进', '承载'],
  ['地点后果', '叙事推进', '承载'],
  ['运营结算', '地点后果', '承载']
  ].forEach(function (r) { ACCOUNTS[r[0]] = { account: r[1], role: r[2] }; });
  const UNCLASSIFIED = '未归类';


  function tokensOf(text) {
    const s = String(text == null ? '' : text);
    if (!s) return 0;
    let cjk = 0;
    for (let i = 0; i < s.length; i++) if (CJK.test(s[i])) cjk++;
    const rest = s.length - cjk;
    return Math.ceil(cjk * 1.0 + rest / 4);
  }
  function rankOf(source) {
    const p = PRIORITY[source];
    return p ? p.rank : DEFAULT_RANK;
  }
  function foldable(source) {
    const p = PRIORITY[source];
    return p ? p.fold : true;
  }

  /**
   * 段落级截断：保留头部 + 省略标记，且**保证结果不超 maxTokens**。
   * 用二分求「最大满足 token 上限的字符前缀」，再回退到段落/句子边界
   * （不能用 chars≈tokens×1.6 估算：中日韩 1 字≈1 token，估算会超预算）。
   */
  function trim(text, maxTokens) {
    const s = String(text == null ? '' : text);
    if (tokensOf(s) <= maxTokens) return s;
    const mark = '\n…（内容过长已折叠）';
    const markTokens = tokensOf(mark);
    const allow = maxTokens - markTokens;
    if (allow <= 0) return '';                 // 预算小到连标记都放不下
    let lo = 0, hi = s.length, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tokensOf(s.slice(0, mid)) <= allow) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    let head = s.slice(0, best);
    const cut = Math.max(head.lastIndexOf('\n'), head.lastIndexOf('。'), head.lastIndexOf('；'), head.lastIndexOf('，'));
    if (cut > best * 0.5) head = head.slice(0, cut + 1);
    return head + mark;
  }

  function plan(items, opts) {
    const o = opts || {};
    const rb = resolveBudget(o.budget);
    const budget = Math.max(0, rb.budget);
    // v2.47.0: 每一项带唯一 id（= 输入位置）——此前 kept/folded/dropped 三张表只按 source
    //   记名，而 source 是**用户可见名、不保证唯一**（「连续性约束」等名在同轮里可能多项）。
    //   按名索引会让两条同名项共用同一份折叠文本：一条被折叠 ⇒ 另一条也被替换成同一段，
    //   一条 retained 一条 dropped ⇒ 两条都按 retained 出。id 只用于内部对账，不改变账单语义。
    // v2.85.0 A4：未声明源必须**可观测**。旧实现在这里静默套 DEFAULT_RANK，
    //   于是「优先级表没跟着源面长」这件事在任何读数里都看不见——补表之后，
    //   再加新源却忘了登记，plan().unranked 与 summaryText 会当场报出来。
    const unranked = [];
    const list = (Array.isArray(items) ? items : []).map(function (it, idx) {
      const source = (it && it.source) || '未命名';
      const content = String((it && it.content) || '');
      if (!Object.prototype.hasOwnProperty.call(PRIORITY, source) && unranked.indexOf(source) < 0) unranked.push(source);
      // v2.88.0 O1：项带科目（account/role）——成本账要能按「这笔时间花在哪类事上」分组。
      const acc = ACCOUNTS[source];
      return { id: idx, source: source, content: content, rank: rankOf(source), fold: foldable(source), tokens: tokensOf(content),
        account: (acc && acc.account) || UNCLASSIFIED, role: (acc && acc.role) || null };
    });

    const pinned = list.filter(function (x) { return x.rank <= 2; });
    const optional = list.filter(function (x) { return x.rank > 2; }).sort(function (a, b) { return a.rank - b.rank; });
    const kept = [], folded = [], dropped = [];
    let used = 0;
    // v2.122.0 P2：**占位账** —— 裁决是**顺序**发生的，而「这源为什么没进」在旧账上只留下
    //   结果（reason），留不下过程：它被裁决时，预算已经分给了谁。于是「折叠 / 丢弃」只能
    //   答「为什么」（no_budget 等），答不出「哪条挤掉了哪条」。
    //   这里在裁决过程中顺带记下占位序列：每个被折叠 / 丢弃的项带 `remainAt`（裁决当时的
    //   余量；pinned 保底可能把预算挤爆，此时照实为负——钳到 0 会把它说成「刚好用完」）
    //   与 `blockedBy`（裁决当时已占用预算的项，按裁决顺序；折叠项按折叠后计）。
    //   两项都是**事后推导不出来**的事实（重算要重跑 plan，而输入内容不留档），故必须在此记。
    //   纯观测：不改变任何裁决结果（恒等式 remainAt + ΣblockedBy.tokens = budget 因此恒成立）。
    const occupied = [];
    const occSnap = function () {
      return occupied.map(function (o) { return { source: o.source, tokens: o.tokens }; });
    };

    // ① pinned 优先：整体超预算时，从 rank 最末开始折叠（不静默丢弃 pinned）
    let pinnedTokens = pinned.reduce(function (s, x) { return s + x.tokens; }, 0);
    pinned.forEach(function (x) {
      if (pinnedTokens <= budget || used + x.tokens <= budget) { kept.push(x); used += x.tokens; occupied.push({ source: x.source, tokens: x.tokens }); return; }
      const floorTokens = Math.min(x.tokens, Math.max(FOLD_FLOOR_TOKENS, Math.floor(x.tokens * 0.25)));
      const t = trim(x.content, Math.min(floorTokens, x.tokens));
      const nt = tokensOf(t);
      folded.push({ id: x.id, source: x.source, reason: 'pinned_over_budget', from: x.tokens, to: nt, content: t, remainAt: budget - used, blockedBy: occSnap() });
      kept.push({ id: x.id, source: x.source, tokens: nt });
      used += nt;
      occupied.push({ source: x.source, tokens: nt });
    });

    // ② optional 按优先级填充
    optional.forEach(function (x) {
      const remain = budget - used;
      if (x.tokens <= remain) { kept.push(x); used += x.tokens; occupied.push({ source: x.source, tokens: x.tokens }); return; }
      if (!x.fold || remain < MIN_KEEP_TOKENS) {
        dropped.push({ id: x.id, source: x.source, reason: x.fold ? 'no_budget' : 'not_foldable', tokens: x.tokens, remainAt: remain, blockedBy: occSnap() });
        return;
      }
      const t = trim(x.content, remain);
      const nt = tokensOf(t);
      if (nt < MIN_KEEP_TOKENS) { dropped.push({ id: x.id, source: x.source, reason: 'folded_too_small', tokens: x.tokens, remainAt: remain, blockedBy: occSnap() }); return; }
      folded.push({ id: x.id, source: x.source, reason: 'over_budget', from: x.tokens, to: nt, content: t, remainAt: remain, blockedBy: occSnap() });
      kept.push({ id: x.id, source: x.source, tokens: nt });
      used += nt;
      occupied.push({ source: x.source, tokens: nt });
    });

    return {
      // v2.47.0: inputCount 让 apply 能判「这份计划是不是这份输入算出来的」——长度不符时
      //   退回按 source 名匹配（旧语义），避免把位置对账用在错的计划上。
      inputCount: list.length,
      // 本次输入里没有任何优先级声明的源（去重）。空数组 = 源面已全部被声明覆盖。
      unranked: unranked,
      budget: budget, budgetSource: rb.source, contextSize: rb.contextSize, used: used, remain: Math.max(0, budget - used),
      overBudget: used > budget,
      kept: kept, folded: folded, dropped: dropped,
      // v2.88.0 O1：**成本账**。调用方（render/inject.js）在唯一引擎调用出口上实测
      //   每一源构建花了多少 ms，按 source 名经 opts.costs 交进来；本模块只归类不测量
      //   （纯函数承诺不变：不读 store、不写配置、不落地注入）。三态如实：
      //   有耗时的进分档（其中 0ms 另计 subTick）；非计量项如实进 unmeasured。
      //   两种都不按 0ms 冒充「很快」。
      //   账本主键是**引擎真调用过的源**（见 costSummary ①）：产出空串的源照样进账，
      //   不能因为「它这轮没内容」就把它当成不花时间。
      cost: costSummary(list, o.costs),
      inputTokens: list.reduce(function (s, x) { return s + x.tokens; }, 0),
      saved: list.reduce(function (s, x) { return s + x.tokens; }, 0) - used
    };
  }

  /**
   * 按计划重组注入文本（保序：原始 items 顺序，折叠项用折叠文本）
   *
   * v2.47.0: 改为**按位置对账**。旧实现用 `bySource[source]` / `keepSet[source]` 两张
   *   以 source 名为键的表回填，而 source 是用户可见名、不保证唯一——同轮里出现两条同名项时：
   *     · 一条被折叠、一条被丢弃 ⇒ 两条都命中 `bySource` ⇒ 被丢弃的那条**又回来了**（变成折叠文本）
   *     · 两条都超预算被折叠 ⇒ 两条拿到**同一段**折叠文本（内容串味：第二条的正文被第一条覆盖）
   *   这不是理论问题：真实注入面里「连续性约束」「演化状态」都是固定 source 名，同轮可以出现多项。
   *   计划里每项带 id（= 输入位置），apply 按 id 回填；长度不符（计划不是这份输入算出来的）时
   *   退回旧的按名匹配语义，保持向后兼容。
   * 输出项额外带 `orig`（输入位置）——落地侧靠它回答「这一项最后去哪了」。
   */
  function apply(items, planResult) {
    const p = planResult || plan(items);
    const arr = (Array.isArray(items) ? items : []);
    const byId = (typeof p.inputCount === 'number') && p.inputCount === arr.length;
    const foldById = {}, keepById = {};
    if (byId) {
      p.folded.forEach(function (f) { if (typeof f.id === 'number') foldById[f.id] = f.content; });
      p.kept.forEach(function (k) { if (typeof k.id === 'number') keepById[k.id] = true; });
    }
    const bySource = {}, keepSet = {};
    if (!byId) {
      p.folded.forEach(function (f) { bySource[f.source] = f.content; });
      p.kept.forEach(function (k) { keepSet[k.source] = true; });
    }
    let seq = 0;
    // v0.1.2: 透传原始项的全部字段（position/depth 等），槽位路由依赖这些字段
    return arr.map(function (it, idx) {
      const source = (it && it.source) || '未命名';
      const base = (it && typeof it === 'object') ? it : {};
      const foldedHere = byId ? (foldById[idx] !== undefined) : (bySource[source] !== undefined);
      const keptHere = byId ? !!keepById[idx] : !!keepSet[source];
      // v2.47.0: orig = 输入位置，落地侧按它对账「这一项最后进了哪里」
      if (foldedHere) return Object.assign({}, base, { orig: idx, source: source, content: byId ? foldById[idx] : bySource[source], folded: true, seq: seq++ });
      if (keptHere) return Object.assign({}, base, { orig: idx, source: source, content: String((it && it.content) || ''), folded: false, seq: seq++ });
      return null;
    }).filter(Boolean);
  }

  /** 自动预算档：从宿主上下文窗口推导（比例 6%，夹在 [800,4000]） */
  const AUTO_RATIO = 0.06, AUTO_MIN = 800, AUTO_MAX = 4000;
  function resolveContextSize() {
    const tryVal = function (v) { return (typeof v === 'number' && isFinite(v) && v > 512) ? v : null; };
    try {
      const W = (typeof window !== 'undefined') ? window : global;
      const cand = [
        W.oai_settings && W.oai_settings.openai_max_context,
        W.SillyTavern && W.SillyTavern.getContext && (function () { try { const c = W.SillyTavern.getContext(); return c && (c.maxContext || (c.chatMetadata && c.chatMetadata.maxContext)); } catch (e) { return null; } })(),
        WA.store && WA.store.read && WA.store.read('meta.contextSize')
      ];
      for (let i = 0; i < cand.length; i++) { const v = tryVal(cand[i]); if (v) return v; }
    } catch (e) { /* 非浏览器环境回落 */ }
    return null;
  }
  function autoBudget(contextSize) {
    const cs = (typeof contextSize === 'number' && isFinite(contextSize) && contextSize > 512) ? contextSize : resolveContextSize();
    if (!cs) return { budget: DEFAULT_BUDGET, source: 'default', contextSize: null };
    const raw = Math.round(cs * AUTO_RATIO);
    return { budget: Math.max(AUTO_MIN, Math.min(AUTO_MAX, raw)), source: 'auto', contextSize: cs };
  }
  /** 统一入口：budget 为负数/未给 → 自动档 */
  function resolveBudget(budget) {
    if (budget == null || budget < 0) return autoBudget();
    return { budget: budget | 0, source: 'manual', contextSize: null };
  }

  /**
   * v2.88.0 O1：成本账汇总（纯函数）。
   *   `costs` 形如 { '关系六型': 3.2, '人际此刻': 0.4, ... }（毫秒，按源显示名）。
   *   为什么分档 + 科目两层都要：分档答「慢不慢」，科目答「这笔时间值不值得花」——
   *   同为 30ms，花在「世界骨架」与花在「账目与观测」上的处置方向完全不同。
   *   `unmeasured` 不是「忘了测」，而是**不在本账口径内**：进 list 的项并不全是引擎源——
   *   `世界状态`（快照）、`叙事工艺`（自带 try/catch）、`近端事件`（内联 try）、以及外部经
   *   ctx.injections 交来的项都不过 engineCall，也就没有耗时可交。**如实列出它们，不按 0ms 记账**：
   *   把非计量项当 0ms 入账，账上会凭空多出「零成本源」，总耗时看着就比真实的小。
   *   `unclassified` 则是一面镜子：非空 ⇒ 源面长了而科目表没跟上（新增源当场报出，不静默归其它）。
   *   `costs` 每项可为数字（毫秒）或 `{ ms, n }`（毫秒 + 构建次数）。为什么要次数：墙体时钟精到
   *   1ms，快引擎构建一次很可能量到 **0**；此时「0ms」是**低于计时精度**，不是「不花时间」。
   *   拿 0 当读数就是拿精度下限冒充结论，故按 `subTick` 单独计数并如实报出。
   */
  function costSummary(list, costs) {
    const cs = (costs && typeof costs === 'object') ? costs : null;
    const byList = {};
    (Array.isArray(list) ? list : []).forEach(function (x) { if (!byList[x.source]) byList[x.source] = x; });
    const bands = { short: 0, medium: 0, long: 0 };
    const accounts = {};
    const unclassified = [];
    const unmeasured = [];
    const rows = [];
    let measured = 0, totalMs = 0, slowest = null, subTick = 0;
    function bucket(name, account, role) {
      return accounts[account] || (accounts[account] = { count: 0, measured: 0, unmeasured: 0, ms: 0, bands: { short: 0, medium: 0, long: 0 } });
    }
    // ① 主循环以**引擎真调用过的源**为账本主键，而不是以 list 为账本。
    //   这个分别很关键：引擎源构筑后返回空串是常事（世界没这块数据），
    //   但「产出空」≠「不花时间」——它可能算了一大圈才发现没什么可说。
    //   旧形只从 list 出发，于是 42 个引擎源里只有那几个碰巧有内容的进账，
    //   实测（tools/diag_o1 口径）：空世界下 42 源有耗时、账上只见 0 源。
    Object.keys(cs || {}).forEach(function (name) {
      const ent = cs[name];
      const obj = !!(ent && typeof ent === 'object');
      const raw = obj ? ent.ms : ent;
      if (typeof raw !== 'number' || !isFinite(raw)) return;   // 台账里的坏行不入账，也不静默当 0
      const runs = obj ? (ent.n | 0) : 1;
      const ms = Math.round(raw * 100) / 100;
      const band = costOf(raw).band;
      const sub = (raw === 0 && runs > 0);
      if (sub) subTick++;
      const x = byList[name] || null;
      const meta = ACCOUNTS[name] || null;
      const account = (x && x.account) || (meta && meta.account) || UNCLASSIFIED;
      const role = (x && x.role) || (meta && meta.role) || null;
      if (account === UNCLASSIFIED && unclassified.indexOf(name) < 0) unclassified.push(name);
      bands[band]++; measured++; totalMs += raw;
      if (!slowest || raw > slowest.ms) slowest = { source: name, ms: ms, band: band, runs: runs };
      const a = bucket(name, account, role);
      a.count++; a.measured++; a.ms = Math.round((a.ms + raw) * 100) / 100; a.bands[band]++;
      rows.push({ source: name, account: account, role: role, ms: ms, band: band, runs: runs, sub: sub, measured: true, injected: !!x });
    });
    // ② list 里而台账里没有的项 = 非计量项（快照 / 工艺 / 内联 / 外部注入）。
    //   它们也算进科目分布（count 计入），但**不计入 measured 与 totalMs**——
    //   把非计量项当 0ms 入账，账上会凭空多出「零成本源」，总耗时看着就比真实的小。
    (Array.isArray(list) ? list : []).forEach(function (x) {
      if (cs && Object.prototype.hasOwnProperty.call(cs, x.source)) return;
      if (unmeasured.indexOf(x.source) < 0) unmeasured.push(x.source);
      const a = bucket(x.source, x.account, x.role);
      a.count++; a.unmeasured++;
    });
    return {
      measured: measured, unmeasured: unmeasured, unmeasuredCount: unmeasured.length, subTick: subTick, totalMs: Math.round(totalMs * 100) / 100,
      bands: bands, accounts: accounts, unclassified: unclassified, slowest: slowest, rows: rows
    };
  }
  /**
   * v2.88.0 O1：成本只读视图（面板/诊断消费）。
   *   传计划对象直接取其 cost；传 null 时返回一份「未规划」结构的**零值**，
   *   而不是 null —— 调用方就不得不写 `(v||{}).bands` 这种防御代码。
   */
  function costView(planResult) {
    // 两种入参都收：`plan()` 的返回值（有 .cost），或**裸的成本账**本身。
    //   为什么后者必要：UI 是从存档快照（lastInjection.budget.cost）拿的，那一份不是 plan 结果；
    //   若只收前者，消费方就得自己拼一个 { cost: x } 的空壳——多一层没必要的东西。
    const src = planResult || null;
    const c = (src && src.cost) ? src.cost : ((src && typeof src.measured === 'number') ? src : null);
    if (!c) return { planned: false, measured: 0, totalMs: 0, subTick: 0, bands: { short: 0, medium: 0, long: 0 }, accounts: {}, unclassified: [], unmeasured: [], unmeasuredCount: 0, slowest: null, rows: [] };
    return { planned: true, measured: c.measured, totalMs: c.totalMs, subTick: c.subTick, bands: c.bands, accounts: c.accounts, unclassified: c.unclassified, unmeasured: c.unmeasured, unmeasuredCount: c.unmeasuredCount, slowest: c.slowest, rows: c.rows };
  }
  /**
   * v2.123.0 P3：**局部重算观测**（纯函数；只观测，不做真增量优化）。
   *
   * 治的病：O1 的成本账只答「单源构建花了多少 ms」，答不出「改一条人物之后，
   *   **这轮真算了几个源、又有几个源一个活都没干**」——于是「局部重算」这件事
   *   在治理面上既看不见也证不了；而更要紧的是，**声称跳过的源若仍在重算**，
   *   现状下没有任何读数会让它现形。
   *
   * 本账只报两个**已发生的事实**，不推任何依赖：
   *   ① `touched`  —— 本轮**真被调用过**的源（= 调用方交来的耗时台账里有的源名）。
   *      口径与 `costSummary` 的主键同源：账本键取自**真调用现场**，不是「进了 items 的源」
   *      （产出空串 ≠ 没干活，v2.88.0 [A3] 钉着这一条）。同名只算一个源。
   *   ② `untouched` —— 本模块**已知源面**里这轮一个活都没干的源（= 跳过集）。
   *      源面取自 `PRIORITY` 的键（本模块自己的源名表，不新造第二份真源 ——
   *      与 `ACCOUNTS` 同源已由 tests/cost-v2880.js 的 [A1] 成类锁看住）。
   *
   * **不变式**：`touched ∩ untouched = ∅` 且 `touched ∪ untouched = 已知源面`。
   *   「声称跳过却仍重算」的落地形态正是这条被破坏：把 `touched` 写成全集 ⇒
   *   `untouched` 空 ⇒ 「跳过 M 源」这句话再也说不出来（专锁的负控制打的就是这一枪）。
   *
   * 诚实边界（如实登记，不假装更强）：
   *   · 本账**不报**「哪个世界键导致哪个源重算」。源级依赖表本仓不存在 —— 空世界下有些源
   *     根本早退（不碰 store），隐式依赖住在代码里；硬抽一张表出来就是**新造第二套真源**
   *     （v2.102.0 对 `perf-trace` 的同一裁决）。故 `dirtyKeys` 只作为**本轮为何重算**的
   *     标注被照抄带回，不参与任何推导。
   *   · `reuse` 面是**可选**输入（来自 `perf-trace.partial()` 的复用读数）。没传时如实报
   *     `reuseKind: 'absent'`，不拿空数组冒充「一次都没复用」。
   *   · 纯观测：不改任何裁决、不读 store、不落盘（与 `costSummary` 同承诺）。
   *
   * @param {object} costs  本轮真实耗时台账（键 = 源显示名，值 = ms 或 { ms, n }）
   * @param {object} [opts] `{ dirtyKeys: string[], reuse: { reused: string[], recomputed: string[] } }`
   */
  function incrementalCost(costs, opts) {
    const o = opts || {};
    // 已知源面：本模块的优先级表就是源名真源（不引 render 侧的 SOURCES ——
    //   两张表各有各的面，本模块读不到，也不该假设它同步）。
    const known = Object.keys(PRIORITY);
    // ① 本轮真被调用过的源：取自调用方交来的**现场台账**，只认本模块认识的源名。
    //   不认识的源名如实另计到 `unrecognized`，不静默并入 touched ——
    //   否则「源面长了一张表没跟上」这件事会被本账吞掉。
    const cs = (costs && typeof costs === 'object') ? costs : {};
    const touched = [], unrecognized = [];
    Object.keys(cs).forEach(function (name) {
      const ent = cs[name];
      const obj = !!(ent && typeof ent === 'object');
      const raw = obj ? ent.ms : ent;
      if (typeof raw !== 'number' || !isFinite(raw)) return;   // 坏行不入账（与 costSummary 同口径）
      if (known.indexOf(name) < 0) { if (unrecognized.indexOf(name) < 0) unrecognized.push(name); return; }
      if (touched.indexOf(name) < 0) touched.push(name);
    });
    touched.sort();
    const untouched = known.filter(function (k) { return touched.indexOf(k) < 0; }).sort();
    // ② dirtyKeys：调用方声明的本轮变脏的世界键。**照抄**（去重 + 排序），不推导。
    const dirtyKeys = (Array.isArray(o.dirtyKeys) ? o.dirtyKeys : [])
      .map(function (k) { return String(k == null ? '' : k); })
      .filter(function (k, i, arr) { return k && arr.indexOf(k) === i; })
      .sort();
    // ③ reuse 面：可选，缺则如实报缺（不拿空数组冒充「一次都没复用」）。
    const rv = (o.reuse && typeof o.reuse === 'object') ? o.reuse : null;
    const pick = function (x) { return (Array.isArray(x) ? x : []).map(function (s) { return String(s == null ? '' : s); }).filter(Boolean).sort(); };
    const reused = rv ? pick(rv.reused) : [];
    const recomputed = rv ? pick(rv.recomputed) : [];
    const total = known.length;
    return {
      dirtyKeys: dirtyKeys, dirtyCount: dirtyKeys.length,
      touched: touched, touchedCount: touched.length,
      untouched: untouched, untouchedCount: untouched.length,
      unrecognized: unrecognized,
      knownCount: total,
      // 覆盖率不看「跳过多少」而看「源面里有多少真干过活」——跳过的比例本身不是缺陷，
      //   缺陷是「源面增长而本账不认识它」（`unrecognized` 非空即报）。
      coverage: total ? Math.round((touched.length / total) * 1000) / 1000 : 0,
      reuseKind: rv ? 'reported' : 'absent',
      reused: reused, recomputed: recomputed,
      note: '只报「这轮真算了什么 / 跳过了什么」；不报「哪个键导致哪个源重算」'
        + '（源级依赖表本仓不存在，硬抽即新造第二套真源）'
    };
  }
  function summaryText(p) {
    if (!p) return '未规划';
    const tail = p.folded.length ? '｜折叠 ' + p.folded.length : '';
    const drop = p.dropped.length ? '｜丢弃 ' + p.dropped.length : '';
    // v2.85.0 A4：未声明源在摘要里也要看得见（调用方传的是精简对象时容错）。
    // v2.88.0 O1：未声明源**指名报出**（旧形只报个数）。为什么必须指名：只给「未声明 3 源」时，读者
    //   无从判断那三个是谁，也就无从去补表——它把一条可行动的缺陷读数变成了一个纯计数。
    const un = (p.unranked && p.unranked.length) ? '｜未声明 ' + p.unranked.length + ' 源[' + p.unranked.slice(0, 4).join('/') + ']' : '';
    // v2.88.0 O1：成本一句——仅当有**实测**耗时时追加。未测量时如实不提，不拿 0ms 冒充「很快」。
    const cst = (p.cost && p.cost.measured) ? '｜耗时 ' + p.cost.totalMs + 'ms'
      + (p.cost.slowest ? '(' + p.cost.slowest.source + ' 最慢 ' + p.cost.slowest.ms + 'ms)' : '')
      + (p.cost.subTick ? '(' + p.cost.subTick + ' 源低于 1ms)' : '') : '';
    // v2.88.0 O1：**一个引擎源都没量到**要看得见（说明成本面根本没工作，而不是「很快」）。
    //   除此之外不报 unmeasured：快照总是非计量项，每轮都报就成了噪音，读的人会开始不看它。
    const abs = (p.cost && p.cost.measured === 0 && p.cost.unmeasuredCount) ? '｜本轮无引擎调用（' + p.cost.unmeasuredCount + ' 项非计量）' : '';
    return '注入 ' + p.used + '/' + p.budget + 't' + tail + drop + un + cst + abs + (p.saved > 0 ? '｜省 ' + p.saved + 't' : '');
  }

  WA.injectBudget = {
    DEFAULT_BUDGET, MIN_KEEP_TOKENS, FOLD_FLOOR_TOKENS, PRIORITY, AUTO_RATIO, AUTO_MIN, AUTO_MAX,
    autoBudget, resolveBudget, resolveContextSize,
    tokensOf, rankOf, foldable, trim, plan, apply, summaryText,
    // v2.88.0 O1：成本面**只导出两个**，且两个都有真消费方：
    //   · costOf —— tool-diag 的 secInject 用它给「最慢 5 源」贴档位（分档只有贴到读数上才有人看）；
    //   · costView —— ui/panel.js 的「本轮注入」段用它渲染上轮耗时与科目分布。
    //   COST_BANDS / ACCOUNTS / UNCLASSIFIED 是**实现细节而非承诺**，不导出：
    //   导出一个没人读的常量就是给自己加一份要维护的接口面（还要为它付冻结串的价）。
    //   需要它俩的地方在本模块内（costOf / costSummary），屏外一律走 plan + costView。
    // v2.123.0 P3：**局部重算观测**多导出第三个口，理由与前两个逐字同规格——它有真消费方：
    //   · incrementalCost —— render/inject.js 在唯一引擎调用出口旁真调它并把读数落进
    //     `lastInjection.recalc`，面板「本轮注入」段逐字段读出来（「重算 N 源 / 跳过 M 源」）。
    //   本口仍是纯函数（不读 store、不落盘），故不破坏本模块的纯计算承诺。
    costOf, costView,
    incrementalCost
  };
  if (WA.log) WA.log('info', '注入预算裁判已加载');
})();
