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
  /**
   * v2.529.0（OPV29-10 拆段）：三块**科目表**已搬到 engines/inject-budget-tables.js，
   *   本文件只留算法。表必须在引擎之前装载（index.js LOAD_ORDER / tests/run.js LOAD 同序双登记）。
   *   缺表就当场抛错：空表能让「pinned 绝不静默丢弃」静默失效，比崩溃危险得多。
   */
  const __TB = WA.injectBudgetTables;
  if (!__TB || !__TB.PRIORITY || !__TB.COST_BANDS || !Array.isArray(__TB.ACCOUNTS_ROWS)
    || Object.keys(__TB.PRIORITY).length === 0 || __TB.ACCOUNTS_ROWS.length === 0) {
    throw new Error('inject-budget: 科目表未装载或为空 —— engines/inject-budget-tables.js 必须在 engines/inject-budget.js 之前，且表不得为空');
  }
  const PRIORITY = __TB.PRIORITY;
  const DEFAULT_RANK = 6;

  // ══════════════════ v2.88.0 O1：注入成本实测与分档 ══════════════════
  /**
   * 成本分档：短 / 中 / 长 三档（按单源构建耗时归类）。
   *   为什么必须分档而不只报一个总数：本模块早已报「用了多少 token」，而耗时这一维
   *   从未被测量过——「注入慢在哪、慢在谁身上」在治理面上完全不可答。
   *   分档按人机交互尺度切：≤2ms 无感、≤16ms 一帧内、再往上用户能感知。分档纯属解释面，不参与任何判定（不因慢而丢源）。
   */
  const COST_BANDS = __TB.COST_BANDS;
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
  __TB.ACCOUNTS_ROWS.forEach(function (r) { ACCOUNTS[r[0]] = { account: r[1], role: r[2] }; });
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
  /**
   * v2.215.0（优化 Q6）：**结构化原子裁切**。
   *   治的病：本仓各源的 block 形态统一为 `[标题]\n原子行…\n尾部约束句`（实测 intel / life /
   *   bonds / causal / org / world 等皆然），而旧 `trim()` 按**字符前缀**截断 + 标点回退，
   *   产生两种半条件：① 原子行被**行内切断**（`因果：A、B → ` 之后没了 —— 读者拿到半条因果）；
   *   ② **尾部约束句整条消失**（`不得补写` / `只能依据自己持有的情报行动` 这类关键约束压根
   *   没进 prompt —— 比半条更糟）。Q6 要求的「原子块有独立裁切边界、保留闭合结构与事实来源、
   *   最终 prompt 不出现半条关键约束」正是这两条的反面。
   *   本函数按**结构单元**裁：头与尾各是一个完整单元（要么整条在、要么整条不在），body 行
   *   逐行整取整舍（空行不占账、原样保留分隔）。优先级 head > tail > body 行 —— 尾部是
   *   **关键约束**，预算不够时先舍 body 行、不先舍它。
   *   返回 `null` = 「不是结构化块」⇒ 调用方回退到字符级 trim（**不假装能判**）。
   *   边界（如实登记）：① 结构头认 `[标题]` 首行（≤80 字）；② 尾约束认「最后一段非空、
   *   且不含原子行分隔标记 `：`/`→`/`｜`的整句」——判不出时不当尾处理（保守失败，只影响
   *   裁切粒度、不会切错内容）；③ 头+尾都放不下时如实标记 `tailKept:false` 语义（出省略
   *   标记），不假称保留了约束；④ 兜底复核 `tokensOf(out) <= maxTokens`，不满足即回退，
   *   保证 trim 的「结果必不超上限」契约不破。
   */
  const STRUCT_HEAD_RE = /^(\s*\[[^\]\n]{1,80}\]\s*\n)/;
  const ATOM_SEP_RE = /[：→｜]/;
  function splitStruct(s) {
    const t = String(s == null ? '' : s);
    const m = STRUCT_HEAD_RE.exec(t);
    if (!m) return null;
    const head = m[1];
    const lines = t.slice(head.length).split('\n');
    let tailAt = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^\s*$/.test(lines[i])) continue;
      if (!ATOM_SEP_RE.test(lines[i])) tailAt = i;   // 无分隔标记 ⇒ 是自然语言约束句
      break;
    }
    return {
      head: head,
      body: tailAt >= 0 ? lines.slice(0, tailAt) : lines,
      tail: tailAt >= 0 ? lines.slice(tailAt).join('\n') : ''
    };
  }
  function trimStructured(text, maxTokens) {
    const st = splitStruct(text);
    if (!st) return null;
    const headT = tokensOf(st.head), tailT = tokensOf(st.tail);
    const mark = '\n…（内容过长已折叠）';
    const markT = tokensOf(mark);
    if (headT > maxTokens) return null;                 // 头都放不下 ⇒ 无「结构」可保，退字符级
    const tailKept = tailT > 0 && (headT + tailT + markT <= maxTokens);
    let remain = maxTokens - headT - markT - (tailKept ? tailT : 0);
    const kept = [];
    let dropped = 0;
    for (let i = 0; i < st.body.length; i++) {
      const ln = st.body[i];
      if (/^\s*$/.test(ln)) { kept.push(ln); continue; }   // 空行不占账：保留分隔结构
      const lt = tokensOf(ln);
      if (lt <= remain) { kept.push(ln); remain -= lt; }
      else dropped++;
    }
    let out = st.head + kept.join('\n');
    if (dropped > 0 || !tailKept) out += mark;
    if (tailKept) out += '\n' + st.tail;
    return tokensOf(out) <= maxTokens ? out : null;      // 兜底：不满足上限即回退
  }

  function trim(text, maxTokens) {
    const s = String(text == null ? '' : text);
    if (tokensOf(s) <= maxTokens) return s;
    // v2.215.0（Q6）：结构化块走原子裁切；非结构化块返回 null 时落回下方字符级逻辑。
    const sorted = trimStructured(s, maxTokens);
    if (sorted !== null) return sorted;
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

  /**
   * v2.296.0（V10 OPV10-8）：自适应降档单行摘要生成器
   * 当预算严重不足（超预算但余量不够 MIN_KEEP_TOKENS 或被常规折叠判定为 folded_too_small）时，
   * 将结构化块优雅压缩为单行极简摘要（带闭合标签与核心事实），占用仅 10~25 tokens。
   */
  function compactSummary(text, maxTokens) {
    const s = String(text == null ? '' : text).trim();
    if (!s) return '';
    const st = splitStruct(s);
    let title = '';
    let firstLine = '';
    if (st && st.head) {
      title = st.head.replace(/[\r\n]/g, '').trim();
      const firstValid = (st.body || []).filter(function (l) { return l && !/^\s*$/.test(l); })[0];
      if (firstValid) firstLine = firstValid.trim();
    } else {
      const lines = s.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      title = lines[0] || '';
      firstLine = lines[1] || '';
    }
    let res = title;
    if (firstLine && firstLine !== title) {
      res += ' ' + firstLine;
    }
    // 控制在合理长度内并保证单行闭合
    if (res.length > 55) res = res.slice(0, 52) + '…';
    if (tokensOf(res) <= maxTokens) return res;
    return '';
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
      let nt = tokensOf(t);
      if (nt < MIN_KEEP_TOKENS) {
        // v2.296.0（V10 OPV10-8）：自适应紧凑降档
        const compact = compactSummary(x.content, remain);
        const ct = tokensOf(compact);
        if (compact && ct > 0 && ct <= remain) {
          folded.push({ id: x.id, source: x.source, reason: 'compact', from: x.tokens, to: ct, content: compact, remainAt: remain, blockedBy: occSnap() });
          kept.push({ id: x.id, source: x.source, tokens: ct });
          used += ct;
          occupied.push({ source: x.source, tokens: ct });
          return;
        }
        dropped.push({ id: x.id, source: x.source, reason: 'folded_too_small', tokens: x.tokens, remainAt: remain, blockedBy: occSnap() });
        return;
      }
      folded.push({ id: x.id, source: x.source, reason: 'over_budget', from: x.tokens, to: nt, content: t, remainAt: remain, blockedBy: occSnap() });
      kept.push({ id: x.id, source: x.source, tokens: nt });
      used += nt;
      occupied.push({ source: x.source, tokens: nt });
    });

    // v2.261.0（V6 OPV6-6）：**余量必须是一个读数，不能是「读者自己拿 used 减 budget」**。
    //   现场立据（tools/v6probes/p_budget2.js）：长局用到 2400 的 43%，余量 1368t 在
    //   summaryText、诊断包、面板三处**全部不可见**——只有 `注入 500/2400t`。
    //   「还剩多少」要能被直接读出来，否则「预算不够用」永远是玩家的第一直觉，
    //   而真实结论是「额度用了不到一半，机制没开够」。
    //   `spareSources` 的口径：按**本轮已落地源的平均体量**估算「同样的源还能再塞几个」。
    //   它是**估算而不是承诺**（下一个源可能比平均大得多），故 note 里逐字写明。
    const remainRaw = Math.max(0, budget - used);
    const keptTokens = kept.map(function (x) { return x.tokens; })
      .filter(function (t) { return typeof t === 'number' && t > 0; });
    const avgKept = keptTokens.length
      ? Math.floor(keptTokens.reduce(function (acc, t) { return acc + t; }, 0) / keptTokens.length) : null;
    const spareSources = (avgKept && remainRaw > 0) ? Math.floor(remainRaw / avgKept) : 0;
    // ── v2.524.0（OPV27-4）：被裁清单带「可替代性档位」与「省下多少」──────────
    //   现场读数 R4：预算裁决只打一行 `注入 500/2400t`。玩家问「这轮关系块为什么没进来」，
    //   账上只有 `no_budget` 三个字母 —— 它回答了「额度不够」，却答不出更要紧的那一问：
    //   **丢了它，我损失了多少信息？**
    //   故给每条被裁项贴一个档位（口径只用本轮已落地的事实推，不做二次裁决）：
    //     · unique    —— 同科目本轮没有别的源落地 ⇒ 这条信息是真丢了；
    //     · redundant —— 同科目另有源落地 ⇒ 丢它损失小（读者仍能看到那一科的事）；
    //     · optional  —— 该源没有科目归类 ⇒ 说不清可替代性，**如实说说不清**。
    //   `savedTokens` = 丢它 / 折它省下的额度（dropped 取全量，folded 取 from-to）。
    //   纯观测：档位不参与、也不改变任何裁决结果。
    const landedAccounts = {};
    const selfLanded = {};
    kept.forEach(function (k) {
      const it = list[k.id];
      if (it && it.account) landedAccounts[it.account] = (landedAccounts[it.account] || 0) + 1;
      selfLanded[k.id] = true;
    });
    const tierOf = function (row) {
      const it = list[row.id];
      const acc = (it && it.account) || UNCLASSIFIED;
      if (acc === UNCLASSIFIED) return 'optional';
      // 计入落地源时**排除自己**：一条已被折叠保住的项，不该因为「它自己还在正文里」
      //   就自称冗余 ——「丢它损失小」问的是「没有它，这一科还有没有人说」。
      const others = (landedAccounts[acc] || 0) - (selfLanded[row.id] ? 1 : 0);
      return others > 0 ? 'redundant' : 'unique';
    };
    let droppedTokens = 0;
    dropped.forEach(function (d) {
      d.tier = tierOf(d);
      d.savedTokens = d.tokens;
      droppedTokens += d.tokens;
    });
    folded.forEach(function (f) {
      f.tier = tierOf(f);
      f.savedTokens = Math.max(0, (f.from || 0) - (f.to || 0));
    });
    return {
      // v2.47.0: inputCount 让 apply 能判「这份计划是不是这份输入算出来的」——长度不符时
      //   退回按 source 名匹配（旧语义），避免把位置对账用在错的计划上。
      inputCount: list.length,
      // 本次输入里没有任何优先级声明的源（去重）。空数组 = 源面已全部被声明覆盖。
      unranked: unranked,
      budget: budget, budgetSource: rb.source, contextSize: rb.contextSize, used: used, remain: remainRaw,
      // v2.261.0（V6 OPV6-6）：档位口径随计划一起带出去（`-1 自动` / `0 不限` / 正数手动的区分）。
      budgetMode: rb.mode || (rb.source === 'manual' ? 'manual' : 'auto-noctx'),
      // v2.261.0（V6 OPV6-6）：**余量账**（纯观测，不改变任何裁决结果）。
      //   `usedPct` / `freePct` 按**预算**算而不是按上下文窗口：读者关心的是「这份额度用了多少」。
      //   `saturated` 的判据是「用满，或余量小到再放不下最小可保项（MIN_KEEP_TOKENS）」——
      //   「还剩 12t」在工程上就是饱和，报「还有余量」等于骗人。
      headroom: {
        remain: remainRaw,
        usedPct: budget > 0 ? Math.round((used / budget) * 1000) / 10 : (used > 0 ? 100 : 0),
        freePct: budget > 0 ? Math.round((remainRaw / budget) * 1000) / 10 : 0,
        saturated: used >= budget || remainRaw < MIN_KEEP_TOKENS,
        avgKeptTokens: avgKept,
        spareSources: spareSources,
        note: avgKept
          ? '可再开 ' + spareSources + ' 个源，按本轮已落地源的平均体量（' + avgKept + 't/源）估算，不是承诺'
          : '本轮没有可参照的落地源体量，给不出「可再开几个源」'
      },
      overBudget: used > budget,
      kept: kept, folded: folded, dropped: dropped,
      // v2.524.0（OPV27-4）：本轮**因裁撤而省下的额度**（被丢项全量 + 被折项折掉的差额）。
      //   与 `saved`（输入总量减落地量）不是一回事：saved 含折叠与丢弃，本值只算「没进正文的部分」，
      //   同一轮两个数会有微小差，故各自命名、不互相顶替。
      droppedTokens: droppedTokens,
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
  /**
   * 统一入口：budget 为负数/未给 → 自动档。
   *
   * v2.261.0（V6 OPV6-6）：**`-1 自动` 与「从未配置」在读数上必须分得开**。
   *   修前两支都回 `source:'default'`（`autoBudget()` 在拿不到上下文窗口时返回的就是它），
   *   于是「玩家选了按上下文比例算、但上下文没量到」与「根本没配过、走默认 2400」在
   *   诊断包与面板上逐字同形——玩家按 `-1` 的语义以为额度会随上下文长，实际恒 2400，
   *   而界面上没有任何一处能告诉他这件事（假绿③：两种不同的原因共用一个读数）。
   *   本版补两枚**只读**字段，不改任何裁决：
   *     · `mode` —— 实际走了哪档。取值域 'auto'（真按 6% 推出来了）/ 'auto-noctx'
   *       （要求自动但量不到上下文，回落 DEFAULT_BUDGET）/ 'manual'（正数上限）/ 'off'（0 = 不限）。
   *     · `requested` —— 调用方要的是什么（原样回显，null = 未给）。
   *   `source` 与 `contextSize` 的语义逐字不变（既有消费方零改动）。
   */
  function resolveBudget(budget) {
    const req = (budget === undefined) ? null : budget;
    if (budget == null || budget < 0) {
      const a = autoBudget();
      return { budget: a.budget, source: a.source, contextSize: a.contextSize,
        mode: (a.source === 'auto') ? 'auto' : 'auto-noctx', requested: req };
    }
    const n = budget | 0;
    return { budget: n, source: 'manual', contextSize: null, mode: (n === 0 ? 'off' : 'manual'), requested: req };
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
  /**
   * v2.261.0（V6 OPV6-6）：**余量读数口**（纯函数，不读 store、不落盘）。
   *
   * 为什么要有它而不是让三个消费方各自 `b.cap - b.used`：
   *   ① 「余量占几成」「算不算饱和」「还能再开几个源」是三条**判据**，不是三个减法——
   *      各自现算必然漂移（`saturated` 用 `remain < MIN_KEEP_TOKENS` 这一条，面板算不对就是
   *      两种结论）。
   *   ② 面板读的是**存档快照**（`lastInjection.budget`），那个对象不是 plan 结果本身；
   *      诊断包读的是同一份快照。两侧要吃同一口径，只能有一个函数。
   *
   * 入参容忍两种形态：plan() 的结果（带 `budget` / `headroom`），或落盘快照（带 `cap` /
   *   `headroom`）。缺 headroom 时**按快照字段现算**并把 `derived` 标成 true——
   *   如实说明「这份余量是事后推出来的，不是裁决当时记下的」。
   */
  function budgetView(p) {
    if (!p || typeof p !== 'object') return null;
    const cap = (typeof p.budget === 'number') ? p.budget : ((typeof p.cap === 'number') ? p.cap : null);
    const used = (typeof p.used === 'number') ? p.used : null;
    if (cap === null || used === null) return null;
    const hr = (p.headroom && typeof p.headroom === 'object') ? p.headroom : null;
    const remain = (hr && typeof hr.remain === 'number') ? hr.remain : Math.max(0, cap - used);
    const derived = !hr;
    const usedPct = cap > 0 ? Math.round((used / cap) * 1000) / 10 : (used > 0 ? 100 : 0);
    const freePct = cap > 0 ? Math.round((remain / cap) * 1000) / 10 : 0;
    const avg = (hr && typeof hr.avgKeptTokens === 'number') ? hr.avgKeptTokens : null;
    const spare = (hr && typeof hr.spareSources === 'number') ? hr.spareSources : ((avg && remain > 0) ? Math.floor(remain / avg) : null);
    const overBudget = (typeof p.overBudget === 'boolean') ? p.overBudget : (used > cap);
    // v2.261.0（V6 OPV6-6）：**档位口径要说人话**。
    //   `mode: 'auto-noctx'` 是「设了自动档但量不到上下文窗口」——这正是本项要治的现场：
    //   玩家按 -1 的语义以为额度随上下文长，实际恒 DEFAULT_BUDGET，而旧读数上它与
    //   「从未配置」逐字同形。`requested` 把它和「没给值」分开，`modeText` 把它说出来。
    const mode = p.budgetMode || p.mode || (p.source === 'manual' ? 'manual' : null);
    const req = (p.requested === undefined) ? undefined : p.requested;
    const modeText = (function () {
      if (mode === 'auto') return '自动档：按上下文 ' + ((typeof p.contextSize === 'number') ? p.contextSize : '?') + ' 的 6% 推出 ' + cap + 't';
      if (mode === 'auto-noctx') {
        return (req === -1 || req === '-1')
          ? ('设为自动档（-1），但量不到上下文窗口，回落默认 ' + cap + 't——额度不会随上下文增长')
          : ('未显式配置，走默认 ' + cap + 't（自动档量不到上下文窗口）');
      }
      if (mode === 'off') return '0 = 不设上限（本模块不裁决）';
      if (mode === 'manual') return '手动上限 ' + cap + 't';
      return (p.source === 'manual') ? ('手动上限 ' + cap + 't') : null;
    })();
    // v2.261.0（V6 OPV6-6）：**档位建议**。
    //   计划原话：「不做『把预算调小』，而是……在未饱和时如实报余量」。故这里只**出建议**
    //   （`advice`），绝不改任何配置、绝不静默收窄——写入口仍在玩家手里。
    //   判据：闲置过半（freePct >= 50）且真裁过项（used > 0）才提，否则不提（不制造焦虑）。
    const advice = (used > 0 && !overBudget && freePct >= 50 && remain >= (MIN_KEEP_TOKENS * 2))
      ? ('额度有 ' + freePct + '% 闲置：本轮实际只需 ' + used + 't。'
        + '收紧到 ≈' + Math.ceil(used / 200) * 200 + 't 也够用（省下的额度不会换来更多内容，'
        + '但能让「额度不够」的错觉消失）；也可以不动——空闲额度没有代价。')
      : ((used > 0 && !overBudget && remain > 0 && remain < MIN_KEEP_TOKENS)
        ? ('余量只剩 ' + remain + 't，已等同饱和：下一个源进不来')
        : null);
    return {
      used: used, cap: cap, remain: remain,
      mode: p.budgetMode || p.mode || (p.source === 'manual' ? 'manual' : null),
      source: p.budgetSource || p.source || null,
      contextSize: (typeof p.contextSize === 'number') ? p.contextSize : null,
      usedPct: usedPct, freePct: freePct,
      saturated: overBudget || remain < MIN_KEEP_TOKENS,
      overBudget: overBudget,
      avgKeptTokens: avg, spareSources: spare,
      derived: derived,
      modeText: modeText, advice: advice,
      // 一句话结论：未饱和时**必须**说得出来（这是本项的全部意义）。
      text: overBudget
        ? ('预算 ' + cap + 't 已超 ' + (used - cap) + 't：pinned 保底项不可裁')
        : (used === 0
          ? ('预算 ' + cap + 't 一分没用：本轮没有可裁项')
          : ('用了 ' + used + '/' + cap + 't（' + usedPct + '%），余量 ' + remain + 't'
            + (spare ? '，可再开 ' + spare + ' 个源' : '')
            + (derived ? '（余量按快照现算，非裁决当时所记）' : '')))
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
    // v2.261.0（V6 OPV6-6）：**余量句**。只在真裁过项（used > 0）且未超支时报——
    //   一项都没裁（items 为空 / 调用方传的是精简对象）时报余量纯属噪音；
    //   超支时余量恒 0，报它只会和超支句打架，故两句话互斥。
    const hr = p.headroom || null;
    const gap = (hr && p.used > 0 && !p.overBudget && hr.remain > 0)
      ? '｜余量 ' + hr.remain + 't(' + hr.freePct + '%)'
        + (hr.spareSources > 0 ? '·可再开 ' + hr.spareSources + ' 源' : '')
      : '';
    const over = p.overBudget ? '｜超支 ' + (p.used - p.budget) + 't（pinned 保底项不可裁）' : '';
    return '注入 ' + p.used + '/' + p.budget + 't' + over + gap + tail + drop + un + cst + abs + (p.saved > 0 ? '｜省 ' + p.saved + 't' : '');
  }

  /** Actual volume, not requested budget. Duplicate names aggregate, item positions remain separate. */
  function volumeView(items, landed, opts) {
    const src = Array.isArray(items) ? items : [], out = Array.isArray(landed) ? landed : src;
    const o = opts || {}, by = Object.create(null);
    function bytes(s) {
      let n = 0;
      for (const ch of s) { const cp = ch.codePointAt(0); n += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4; }
      return n;
    }
    function visit(list, stage) {
      list.forEach(function (it) {
        if (!it) return;
        const name = String(it.source || '未命名'), text = String(it.content || '');
        const r = by[name] || (by[name] = { source: name, inputChars: 0, inputBytes: 0, inputTokens: 0,
          inputItems: 0, chars: 0, bytes: 0, tokens: 0, items: 0 });
        if (stage === 'input') { r.inputChars += text.length; r.inputBytes += bytes(text);
          r.inputTokens += tokensOf(text); r.inputItems++; }
        else { r.chars += text.length; r.bytes += bytes(text); r.tokens += tokensOf(text); r.items++; }
      });
    }
    visit(src, 'input'); visit(out, 'output');
    const witnesses = [];
    const rows = Object.keys(by).sort().map(function (name) {
      const r = by[name];
      const lim = Number((o.limits || {})[name]);
      r.cap = isFinite(lim) && lim >= 0 ? lim : null;
      r.remain = r.cap === null ? null : Math.max(0, r.cap - r.tokens);
      r.over = r.cap !== null && r.tokens > r.cap;
      if (r.over) witnesses.push({ source: name, used: r.tokens, cap: r.cap, excess: r.tokens - r.cap });
      return r;
    });
    const totalTokens = rows.reduce(function (n, r) { return n + r.tokens; }, 0);
    const totalCap = typeof o.totalCap === 'number' && isFinite(o.totalCap) && o.totalCap > 0 ? o.totalCap : null;
    const poolRemain = totalCap === null ? null : Math.max(0, totalCap - totalTokens);
    rows.forEach(function (r) { r.poolRemain = poolRemain; });
    if (totalCap !== null && totalTokens > totalCap) witnesses.push({ source: '*shared*', used: totalTokens, cap: totalCap, excess: totalTokens - totalCap });
    return { totalCap: totalCap, poolRemain: poolRemain, capScope: 'shared-pool; source caps only when explicitly provided', ok: witnesses.length === 0, reason: witnesses.length ? 'budget-exceeded' : '',
      rows: rows, witnesses: witnesses, inputItems: src.length, items: out.length,
      chars: rows.reduce(function (n, r) { return n + r.chars; }, 0),
      bytes: rows.reduce(function (n, r) { return n + r.bytes; }, 0),
      tokens: rows.reduce(function (n, r) { return n + r.tokens; }, 0) };
  }
  /**
   * 「这一源为什么没进来」——一句话回答（OPV27-4 的验收原文）。
   *   只把计划里**已经记着**的事实翻成人话：结果（kept / folded / dropped）、拒因、
   *   可替代性档位、裁决当时的余量、以及当时占着预算的源。**不重新裁决、不猜**：
   *   查无此源就如实说「本轮没有这个源」，绝不编一个被裁理由（编出来的理由比没有更坏）。
   * @param {object} p plan() 的返回值
   * @param {string} source 源名（用户可见名，可能重名 ⇒ 返回全部命中项的逐条说明）
   * @returns {{ok:boolean, source:string, hits:Array, text:string}}
   */
  function explain(p, source) {
    const nm = String(source == null ? '' : source);
    const pl = p || null;
    if (!pl || !nm) return { ok: false, source: nm, hits: [], text: '没有可解释的计划或源名' };
    const TIER_CN = { unique: '同科目只有它（丢了就是真丢）', redundant: '同科目另有源落地（丢它损失小）',
      optional: '该源未归类（说不清替代性）' };
    const REASON_CN = { no_budget: '额度不够且不可折叠', not_foldable: '额度不够，且该源不允许折叠',
      folded_too_small: '折叠后太短，已到不可用下限', pinned_over_budget: '保底源超预算，被折到下限' };
    const hits = [];
    (pl.kept || []).forEach(function (k) {
      if (k.source !== nm) return;
      hits.push({ outcome: 'kept', reason: 'landed', tokens: k.tokens });
    });
    (pl.folded || []).forEach(function (f) {
      if (f.source !== nm) return;
      hits.push({ outcome: 'folded', reason: f.reason, from: f.from, to: f.to, tier: f.tier || null,
        savedTokens: f.savedTokens == null ? Math.max(0, (f.from || 0) - (f.to || 0)) : f.savedTokens,
        remainAt: f.remainAt, blockedBy: (f.blockedBy || []).slice(0, 3) });
    });
    (pl.dropped || []).forEach(function (d) {
      if (d.source !== nm) return;
      hits.push({ outcome: 'dropped', reason: d.reason, tokens: d.tokens, tier: d.tier || null,
        savedTokens: d.savedTokens == null ? d.tokens : d.savedTokens,
        remainAt: d.remainAt, blockedBy: (d.blockedBy || []).slice(0, 3) });
    });
    if (!hits.length) {
      return { ok: false, source: nm, hits: [],
        text: '本轮输入里没有「' + nm + '」这个源（既没进正文，也没被裁 —— 它压根没被构造出来）' };
    }
    const parts = hits.map(function (h) {
      if (h.outcome === 'kept') return '「' + nm + '」进了正文（' + h.tokens + 't）';
      if (h.outcome === 'folded') {
        return '「' + nm + '」被折叠：' + (REASON_CN[h.reason] || h.reason)
          + '（' + h.from + 't → ' + h.to + 't，省 ' + h.savedTokens + 't'
          + (h.tier ? '；' + (TIER_CN[h.tier] || h.tier) : '') + '）';
      }
      return '「' + nm + '」没进正文：' + (REASON_CN[h.reason] || h.reason)
        + '（原本 ' + h.tokens + 't，省 ' + h.savedTokens + 't'
        + (h.tier ? '；' + (TIER_CN[h.tier] || h.tier) : '')
        + (h.remainAt != null ? '；裁决时余量 ' + h.remainAt + 't' : '')
        + (h.blockedBy && h.blockedBy.length
          ? '；当时已占预算：' + h.blockedBy.map(function (b) { return b.source + '(' + b.tokens + 't)'; }).join('、')
          : '') + '）';
    });
    return { ok: true, source: nm, hits: hits, text: parts.join(' ／ ') };
  }

  WA.injectBudget = {
    DEFAULT_BUDGET, MIN_KEEP_TOKENS, FOLD_FLOOR_TOKENS, PRIORITY, AUTO_RATIO, AUTO_MIN, AUTO_MAX,
    autoBudget, resolveBudget, resolveContextSize,
    tokensOf, rankOf, foldable, trim, plan, apply, summaryText, volumeView,
    // v2.261.0（V6 OPV6-6）：余量读数口。三个真消费方：engines/tool-diag.js（诊断包
    //   `budget.headroom`）、ui/panel.js（预算段余量行）、engines/backstage.js（`budgetHeadroom()`）。
    //   本口仍是纯函数，不破坏本模块「不读 store、不写配置、不落地注入」的承诺。
    budgetView,
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
    incrementalCost,
    // v2.524.0（OPV27-4）：把被裁清单翻成一句人话——验收原文是「能回答『这轮关系块为什么没进来』」。
    //   真消费方：engines/tool-diag.js 的诊断节（照源名查一条账）。
    explain
  };
  if (WA.log) WA.log('info', '注入预算裁判已加载');
})();
