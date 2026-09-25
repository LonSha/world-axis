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
    '事件调度': { rank: 5, fold: true },
    // rank 6：推演与结构性面
    '世界推演': { rank: 6, fold: true },
    '资源与组织': { rank: 6, fold: true },
    '长线伏笔': { rank: 6, fold: true },
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
    '快照与分支': { rank: 8, fold: true }
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
    ['叙事摘要', '叙事推进', '承载'], ['事件调度', '叙事推进', '推进'],
    ['场外事件', '叙事推进', '推进'], ['长线伏笔', '叙事推进', '推进'],
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
    // 一次性：本轮消费即清（不进长期账）
    ['近端事件', '账目与观测', '一次性']
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

    // ① pinned 优先：整体超预算时，从 rank 最末开始折叠（不静默丢弃 pinned）
    let pinnedTokens = pinned.reduce(function (s, x) { return s + x.tokens; }, 0);
    pinned.forEach(function (x) {
      if (pinnedTokens <= budget || used + x.tokens <= budget) { kept.push(x); used += x.tokens; return; }
      const floorTokens = Math.min(x.tokens, Math.max(FOLD_FLOOR_TOKENS, Math.floor(x.tokens * 0.25)));
      const t = trim(x.content, Math.min(floorTokens, x.tokens));
      const nt = tokensOf(t);
      folded.push({ id: x.id, source: x.source, reason: 'pinned_over_budget', from: x.tokens, to: nt, content: t });
      kept.push({ id: x.id, source: x.source, tokens: nt });
      used += nt;
    });

    // ② optional 按优先级填充
    optional.forEach(function (x) {
      const remain = budget - used;
      if (x.tokens <= remain) { kept.push(x); used += x.tokens; return; }
      if (!x.fold || remain < MIN_KEEP_TOKENS) {
        dropped.push({ id: x.id, source: x.source, reason: x.fold ? 'no_budget' : 'not_foldable', tokens: x.tokens });
        return;
      }
      const t = trim(x.content, remain);
      const nt = tokensOf(t);
      if (nt < MIN_KEEP_TOKENS) { dropped.push({ id: x.id, source: x.source, reason: 'folded_too_small', tokens: x.tokens }); return; }
      folded.push({ id: x.id, source: x.source, reason: 'over_budget', from: x.tokens, to: nt, content: t });
      kept.push({ id: x.id, source: x.source, tokens: nt });
      used += nt;
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
    costOf, costView
  };
  if (WA.log) WA.log('info', '注入预算裁判已加载');
})();
