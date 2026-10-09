/**
 * WorldAxis engines/entry-router.js (v2.45.0)
 * 世界书条目按需激活路由（缝合来源：Awene cultivation-rule-router）
 *
 * 机制：
 *  - 发送前由 flash 副模型判断「本回合哪些常驻条目该激活」，无关条目只对本次扫描临时 disable
 *  - 不落盘、不改用户开关、不动 UI；一轮结束由酒馆自己重新扫描，天然恢复
 *  - 关联条目：A 触发则 B 必开（B 变为被动条目，不能独立开启）
 *  - 结果缓存：同一输入重复请求复用判定，不重复调用副模型
 *  - 失败策略与 WorldAxis 既有纪律对齐：**一律降级为本回合不隐藏**，
 *    不采用上游「最终超时则中止整个生成任务」那一档——世界引擎无权卡住一次生成
 *
 * 与 monologue 的分工：monologue 是「世界自己推演」，本引擎是「决定宿主世界书谁上场」。
 *   两者都走 inference 通道、都失败放行，但注入位置不同：本引擎改的是宿主扫描结果。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.45.0: 时间源走 clock 单一出口（本仓纪律：产品代码零裸调 Date.now）。
  //   本引擎的 at 字段只进内存台账，按语义归**决策时间**（若哪天要落盘即已合规）。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  // ── 内部状态 ──
  // candidates: { id, title, content, condition, links[] }  用户勾选参与路由的条目
  // passiveIds: Set<string>                                  只被关联触发、不能独立开启
  let candidates = [];
  const passiveIds = new Set();
  let routeCache = [];        // { key, enabled[], at }  同一输入复用
  let lastPlan = null;        // 最近一轮路由结果（供 tool-diag / 面板查看）
  let routeFailure = null;    // 最近一次失败原因（降级时必须留痕，不静默）

  const CACHE_MAX = 20;
  const ROUTE_TIMEOUT_MS = 30000;   // 上游默认 30s，可调 5–300s
  const MAX_CANDIDATES = 60;        // 单轮送副模型的条目上限，防 prompt 爆炸

  // ── 候选集管理 ──
  function listCandidates() {
    return candidates.map(c => ({ id: c.id, title: c.title, condition: c.condition, links: c.links.slice() }));
  }

  function setCandidate(entry) {
    if (!entry || typeof entry.id !== 'string') return false;
    const idx = candidates.findIndex(c => c.id === entry.id);
    const rec = {
      id: entry.id,
      title: String(entry.title || entry.id),
      content: String(entry.content || '').slice(0, 2000),
      condition: String(entry.condition || '').trim(),
      links: Array.isArray(entry.links) ? entry.links.filter(l => typeof l === 'string') : []
    };
    if (!rec.condition) return false;   // 没填启用条件 = 不参与路由（与上游一致）
    if (idx >= 0) candidates[idx] = rec; else candidates.push(rec);
    rebuildPassive();
    return true;
  }

  function removeCandidate(id) {
    const before = candidates.length;
    candidates = candidates.filter(c => c.id !== id);
    rebuildPassive();
    return candidates.length !== before;
  }

  function clearCandidates() {
    candidates = [];
    passiveIds.clear();
  }

  // 被动条目：任何候选的 links 指向它，它就不再独立开启
  function rebuildPassive() {
    passiveIds.clear();
    candidates.forEach(c => c.links.forEach(l => passiveIds.add(l)));
  }

  function isPassive(id) { return passiveIds.has(id); }

  // ── 缓存 ──
  function cacheKey(input) {
    return String(input || '').slice(0, 4000);
  }

  function findCached(key) {
    const hit = routeCache.find(r => r.key === key);
    return hit ? hit.enabled.slice() : null;
  }

  function pushCache(key, enabled) {
    routeCache.push({ key: key, enabled: enabled.slice(), at: clockNow('entryRouter') });
    if (routeCache.length > CACHE_MAX) routeCache.shift();
  }

  function clearCache() { routeCache = []; }

  // ── 提示词 ──
  const ROUTE_SYS = '你是「条目路由」子agent。给定一批世界书条目的启用条件与当前剧情，判断哪些条目本回合应该激活。' +
    '只输出JSON：{"enabled":["条目id",...]}。没有该激活的就给空数组。' +
    '判据是「当前剧情是否真的涉及该条目描述的内容」，不是「内容是否有趣」。' +
    '宁缺勿滥：不确定的不要开。';

  function buildRouteInput(input, recent) {
    const lines = candidates.slice(0, MAX_CANDIDATES).map((c, i) => {
      const passive = isPassive(c.id) ? '（被动：仅被关联触发，不要主动开启）' : '';
      return (i + 1) + '. id=' + c.id + ' 标题=' + c.title + passive + '\n   条件=' + c.condition;
    });
    return '<Entries>\n' + lines.join('\n') + '\n</Entries>\n' +
      '<Recent_Messages>\n' + String(recent || '').slice(0, 3000) + '\n</Recent_Messages>\n' +
      '<Current_Input>\n' + String(input || '').slice(0, 2000) + '\n</Current_Input>';
  }

  // ── 最近剧情 ──
  function recentMessages(n) {
    try {
      const ctx = WA.mainWin.SillyTavern.getContext();
      const chat = (ctx && ctx.chat) || [];
      return chat.slice(Math.max(0, chat.length - (n || 4)))
        .map(m => (m.is_user ? '【玩家】' : '【' + (m.name || '角色') + '】') + String(m.mes || '').slice(0, 600))
        .join('\n');
    } catch (e) { return ''; }
  }

  // ── 归一化副模型输出 ──
  // 上游教训：模型会把 enabled 写成字符串、嵌套对象、或给出不存在的 id。
  // 这里一律过滤到「候选集内且非被动」的合法 id。
  function normalizeEnabled(raw) {
    const valid = new Set(candidates.filter(c => !isPassive(c.id)).map(c => c.id));
    const out = [];
    const push = v => {
      if (typeof v === 'string' && valid.has(v) && out.indexOf(v) < 0) out.push(v);
    };
    if (Array.isArray(raw)) raw.forEach(push);
    else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.enabled)) raw.enabled.forEach(push);
      else Object.keys(raw).forEach(k => { if (raw[k]) push(k); });
    }
    return out;
  }

  // 展开关联：命中的条目把它的 links 全部带上（links 指向的可以是候选也可以是任意条目）
  function expandLinks(enabled) {
    const out = enabled.slice();
    enabled.forEach(id => {
      const c = candidates.find(x => x.id === id);
      if (!c) return;
      c.links.forEach(l => { if (out.indexOf(l) < 0) out.push(l); });
    });
    return out;
  }

  /**
   * 计算本回合路由计划。
   * @param input 本轮玩家输入
   * @returns { ok, enabled, hidden, reason, fromCache, degraded }
   */
  async function plan(input) {
    const cfg = WA.apiRouter.getChannel('inference');
    if (!candidates.length) return { ok: true, enabled: [], hidden: [], reason: '无候选条目', fromCache: false, degraded: false };
    if (!cfg.baseUrl || !cfg.model) {
      // 未配置零开销：不路由 = 全部按宿主原样。这不是失败，是不介入。
      return { ok: true, enabled: candidates.map(c => c.id), hidden: [], reason: '通道未配置，本回合不介入', fromCache: false, degraded: false };
    }

    const key = cacheKey(input);
    const cached = findCached(key);
    if (cached) {
      return { ok: true, enabled: cached, hidden: diffHidden(cached), reason: '缓存命中', fromCache: true, degraded: false };
    }
    // 注意：这里**不缓存失败**。曾考虑「同一输入沿用上轮降级以免重复烧副模型」，但那会让
    //   一次瞬时失败把**这一个输入**永久钉在降级态（换了别的输入才恢复）——一个网络抖动
    //   换来「这句话之后一直隐藏失效」，比多烧一次判定贵得多。失败只留痕、不记忆；
    //   重复调用由拦截器的轮次去重挡住，不靠这里兜。
    const recent = recentMessages(4);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ROUTE_TIMEOUT_MS);
    try {
      const r = await WA.apiRouter.call('inference',
        [{ role: 'system', content: ROUTE_SYS }, { role: 'user', content: buildRouteInput(input, recent) }],
        { json: true, signal: ac.signal, maxTokens: 500, temperature: 0.2 });
      const enabled = expandLinks(normalizeEnabled(r && r.enabled));
      pushCache(key, enabled);
      lastPlan = { enabled: enabled.slice(), at: clockNow('entryRouter'), reason: '路由成功' };
      routeFailure = null;
      return { ok: true, enabled: enabled, hidden: diffHidden(enabled), reason: '路由成功', fromCache: false, degraded: false };
    } catch (e) {
      // v2.45.0：失败一律降级为「本回合不隐藏」。上游在最终超时时会中止整个生成任务，
      //   本仓不采用——世界引擎的注入失败不该让玩家发不出这句话。
      //   但降级必须留痕：routeFailure 供 tool-diag 与面板查看，不静默。
      routeFailure = { message: String((e && e.message) || e), kind: (e && e.kind) || 'unknown', at: clockNow('entryRouter') };
      const all = candidates.map(c => c.id);
      return {
        ok: false,
        enabled: all,
        hidden: [],
        reason: '路由失败，本回合不隐藏（' + routeFailure.kind + '）',
        fromCache: false,
        degraded: true
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function diffHidden(enabled) {
    const on = new Set(enabled);
    return candidates.filter(c => !on.has(c.id)).map(c => c.id);
  }

  /**
   * 将路由结果落到宿主世界书扫描。
   * 上游做法：在 WORLDINFO_ENTRIES_LOADED（getSortedEntries 克隆条目后、扫描前）把隐藏集临时置 disable。
   * 本仓做法：worldbook.js 已持有一份按聊天的覆写表（const|key|off），路由结果写入其中的 'off'，
   *   并在下一轮 plan 时清掉上一轮的 'off'——同样只影响本次扫描、不碰用户持久开关。
   * 之所以不复刻上游的事件时机：我们自己的 worldbook 覆写表是按聊天隔离、可回放、可审计的，
   *   直接改宿主条目对象会绕过 store 的写入台账，属于静默失效面。
   */
  function applyPlan(p) {
    if (!p || p.degraded) return { applied: false, reason: (p && p.reason) || '无计划' };
    try {
      const ov = WA.worldbook.getOverrides() || {};
      const next = {};
      for (const k in ov) if (ov[k] !== 'off') next[k] = ov[k];
      p.hidden.forEach(id => { next[id] = 'off'; });
      WA.worldbook.saveSelection(WA.worldbook.getSelectedIds(), next);
      return { applied: true, hidden: p.hidden.length };
    } catch (e) {
      routeFailure = { message: String((e && e.message) || e), kind: 'apply-failed', at: clockNow('entryRouter') };
      return { applied: false, reason: '覆写落盘失败：' + routeFailure.message };
    }
  }

  function lastFailure() { return routeFailure; }
  function lastRoute() { return lastPlan; }

  WA.entryRouter = {
    listCandidates, setCandidate, removeCandidate, clearCandidates,
    // normalizeEnabled / expandLinks 刻意不导出：它们是 plan 内部的解析步骤，外部零消费
    //   （实测 refs=0、仅测试引用、定义文件内自用 >=2 —— 过度导出）。回归段改经 plan
    //   的端到端行为面覆盖它们，而不是把内部步骤当公共 API 供出去。
    isPassive, plan, applyPlan,
    clearCache, lastFailure, lastRoute, recentMessages,
    ROUTE_SYS, ROUTE_TIMEOUT_MS, MAX_CANDIDATES
  };

  // ── 工作流节点 ──
  // 挂在 before 链、order 60（monologue 之后、render.inject 之前）。
  // 为什么是 before 而不是 host 的 WORLDINFO_ENTRIES_LOADED：本仓覆写表是按聊天隔离、
  //   可回放、可审计的；改宿主条目对象会绕过 store 的写入台账。落点从「改条目」换成
  //   「改我们自己的扫描覆写」，代价是 host 侧原生世界书扫描不受影响——这一点如实说明：
  //   本路由只约束 WorldAxis 自己的 buildPromptSection，不改宿主那一次。
  WA.workflow.register({
    id: 'engines.entryRouter', chain: 'before', order: 60, label: '条目按需路由',
    async run(ctx) {
      if (!candidates.length) return;
      const cfg = WA.apiRouter.getChannel('inference');
      if (!cfg.baseUrl || !cfg.model) return; // 未配置零开销，不介入
      const input = ctx && ctx.userInput
        ? String(ctx.userInput)
        : recentMessages(1);
      const p = await plan(input);
      ctx.entryRoute = p;   // 供 tool-diag / 面板查看（降级也留痕）
      if (p.degraded) {
        WA.log('warn', '条目路由降级：' + p.reason);
        return;
      }
      if (!p.hidden.length) return;
      const r = applyPlan(p);
      if (!r.applied) WA.log('warn', '条目路由覆写未落地：' + r.reason);
    }
  });
})();
