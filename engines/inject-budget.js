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

  /** 源优先级：rank 越小越重要；fold=true 允许超预算时折叠 */
  const PRIORITY = {
    '近端事件': { rank: 1, fold: false },
    '世界状态': { rank: 2, fold: false },
    '主观记忆': { rank: 3, fold: true },
    '记忆': { rank: 4, fold: true },
    '叙事摘要': { rank: 5, fold: true },
    '世界推演': { rank: 6, fold: true },
    '账本': { rank: 7, fold: true },
    '舆情': { rank: 8, fold: true }
  };
  const DEFAULT_RANK = 6;

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
    const list = (Array.isArray(items) ? items : []).map(function (it) {
      const source = (it && it.source) || '未命名';
      const content = String((it && it.content) || '');
      return { source: source, content: content, rank: rankOf(source), fold: foldable(source), tokens: tokensOf(content) };
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
      folded.push({ source: x.source, reason: 'pinned_over_budget', from: x.tokens, to: nt, content: t });
      kept.push({ source: x.source, tokens: nt });
      used += nt;
    });

    // ② optional 按优先级填充
    optional.forEach(function (x) {
      const remain = budget - used;
      if (x.tokens <= remain) { kept.push(x); used += x.tokens; return; }
      if (!x.fold || remain < MIN_KEEP_TOKENS) {
        dropped.push({ source: x.source, reason: x.fold ? 'no_budget' : 'not_foldable', tokens: x.tokens });
        return;
      }
      const t = trim(x.content, remain);
      const nt = tokensOf(t);
      if (nt < MIN_KEEP_TOKENS) { dropped.push({ source: x.source, reason: 'folded_too_small', tokens: x.tokens }); return; }
      folded.push({ source: x.source, reason: 'over_budget', from: x.tokens, to: nt, content: t });
      kept.push({ source: x.source, tokens: nt });
      used += nt;
    });

    return {
      budget: budget, budgetSource: rb.source, contextSize: rb.contextSize, used: used, remain: Math.max(0, budget - used),
      overBudget: used > budget,
      kept: kept, folded: folded, dropped: dropped,
      inputTokens: list.reduce(function (s, x) { return s + x.tokens; }, 0),
      saved: list.reduce(function (s, x) { return s + x.tokens; }, 0) - used
    };
  }

  /** 按计划重组注入文本（保序：原始 items 顺序，折叠项用折叠文本） */
  function apply(items, planResult) {
    const p = planResult || plan(items);
    const bySource = {};
    p.folded.forEach(function (f) { bySource[f.source] = f.content; });
    const keepSet = {};
    p.kept.forEach(function (k) { keepSet[k.source] = true; });
    let seq = 0;
    // v0.1.2: 透传原始项的全部字段（position/depth 等），槽位路由依赖这些字段
    return (Array.isArray(items) ? items : []).map(function (it) {
      const source = (it && it.source) || '未命名';
      const base = (it && typeof it === 'object') ? it : {};
      if (bySource[source] !== undefined) return Object.assign({}, base, { source: source, content: bySource[source], folded: true, seq: seq++ });
      if (keepSet[source]) return Object.assign({}, base, { source: source, content: String((it && it.content) || ''), folded: false, seq: seq++ });
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

  function summaryText(p) {
    if (!p) return '未规划';
    const tail = p.folded.length ? '｜折叠 ' + p.folded.length : '';
    const drop = p.dropped.length ? '｜丢弃 ' + p.dropped.length : '';
    return '注入 ' + p.used + '/' + p.budget + 't' + tail + drop + (p.saved > 0 ? '｜省 ' + p.saved + 't' : '');
  }

  WA.injectBudget = {
    DEFAULT_BUDGET, MIN_KEEP_TOKENS, FOLD_FLOOR_TOKENS, PRIORITY, AUTO_RATIO, AUTO_MIN, AUTO_MAX,
    autoBudget, resolveBudget, resolveContextSize,
    tokensOf, rankOf, foldable, trim, plan, apply, summaryText
  };
  if (WA.log) WA.log('info', '注入预算裁判已加载');
})();
