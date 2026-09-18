/**
 * WorldAxis engines/memory-sampler.js (v0.9.7) — 记忆注入采样器（纯只读）
 *
 * 缝合来源：DlSNlGHT World —— memory-engine.js 的 exponentialMemorySample 机制。
 *
 * 解决的问题：pmem.buildBlock() 用 slice(-8) 无差别截取最近 8 条主观记忆注入，
 * 长局后面临两个问题：
 *   1. 永远只注入最近几条，早期关键记忆（人物的执念、旧仇、误解）从上下文消失
 *      → 人物行为动机断线、"失忆"感
 *   2. 与当前剧情无关的记忆挤占注入预算
 *   3. 同一持有者的重复记忆被全部注入，多样性差
 *
 * 指数衰减采样（源自 World 记忆引擎）：
 *   每条记忆按「年龄」(越靠后越年轻) 计算权重 e^(-age/scale)，
 *   再掷一次 sides 面骰子，取 priority = -ln(roll/(sides+1)) / weight 排序，
 *   截取 limit 条后按原序返回。效果：近期记忆高概率保留，远期记忆按指数概率
 *   被唤醒，每次采样结果不同（骰子随机），注入的内容自然轮换。
 *
 * 上下文相关召回：只注入与当前正文/世界状态相关的记忆（名字/实体名出现在
 * recentText 或 store 快照里），过滤后仍超限时才走采样。
 *
 * 只读保证：不写 store，不调用任何 API，纯函数运算。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const DEFAULT_DICE_SIDES = 10000;
  const MIN_SIDES = 1000, MAX_SIDES = 10000;
  const DEFAULT_LIMIT = 8;
  const MIN_LIMIT = 1, MAX_LIMIT = 30;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function clean(v) { return String(v == null ? '' : v).trim(); }
  function normalized(v) { return clean(v).toLocaleLowerCase(); }

  /**
   * 指数衰减采样（源自 World memory-engine.exponentialMemorySample）
   * @param {Array}  items      候选记忆列表（按时间正序，末尾为最新）
   * @param {number} limit      采样上限
   * @param {function} randomFn 随机数生成器（可注入，便于测试）
   * @param {number} diceSides  骰子面数（越大随机性越平滑）
   * @returns {Array} 采样结果（按原序）
   */
  function exponentialSample(items, limit, randomFn, diceSides) {
    const source = Array.isArray(items) ? items : [];
    const take = clamp(parseInt(limit) || 0, 0, source.length);
    if (!take || !source.length) return [];
    if (source.length <= take) return source.slice();
    const sides = clamp(parseInt(diceSides) || DEFAULT_DICE_SIDES, MIN_SIDES, MAX_SIDES);
    const scale = Math.max(1, take);
    const rnd = (typeof randomFn === 'function') ? randomFn : Math.random;
    return source.map(function (item, index) {
      const age = source.length - 1 - index;
      const weight = Math.max(1 / sides, Math.exp(-age / scale));
      const roll = clamp(Math.floor(Number(rnd()) * sides) + 1, 1, sides);
      const unit = roll / (sides + 1);
      return { item: item, index: index, priority: -Math.log(unit) / weight };
    }).sort(function (a, b) { return a.priority - b.priority; })
      .slice(0, take)
      .sort(function (a, b) { return a.index - b.index; })
      .map(function (entry) { return entry.item; });
  }

  /**
   * 上下文相关性过滤：名字出现在近期正文或世界状态快照里的记忆才算相关
   * @param {Array}  entries   pmem 条目 [{holders,text,time,...}]
   * @param {string} haystack  近期正文 + 世界状态 JSON 拼成的扫描文本
   * @returns {Array} 相关条目（保持原序）
   */
  function filterRelevant(entries, haystack) {
    const hay = normalized(String(haystack || ''));
    if (!hay) return (entries || []).slice();
    return (entries || []).filter(function (e) {
      const holders = (e && e.holders) || [];
      if (!holders.length) return false;
      return holders.some(function (h) {
        const n = normalized(h);
        return n.length >= 2 && hay.indexOf(n) >= 0;
      });
    });
  }

  /**
   * 构建扫描文本：近期正文 + 世界状态快照（人物/实体/区域事件名）
   */
  function buildHaystack(recentText, state) {
    const parts = [String(recentText || '')];
    const st = state || safe(function () { return WA.store.get(); }, null) || {};
    try {
      // v1.1.0: 人物清单统一读权威本体 state.people（兼容旧存档 evolution.people 残留）
      const byId = st.people || {};
      Object.keys(byId).forEach(function (k) { if (byId[k] && byId[k].name) parts.push(byId[k].name); });
      const legacy = (st.evolution && st.evolution.people) || [];
      if (Array.isArray(legacy)) legacy.forEach(function (p) { if (p && p.name) parts.push(p.name); });
      const em = st.evolution && st.evolution.entityMemory;
      if (em) {
        ['organization', 'object', 'ability', 'location'].forEach(function (t) {
          (em[t] || []).forEach(function (e) { parts.push(e && e.name || ''); });
        });
      }
      const ri = st.evolution && st.evolution.regionalIncident;
      if (ri && ri.title) parts.push(ri.title);
      const fs = (st.evolution && st.evolution.factions) || [];
      parts.push(fs.map(function (f) { return f && f.name || ''; }).join(' '));
    } catch (e) { /* 快照构建失败只影响相关性过滤，不阻断 */ }
    return parts.join('\n');
  }
  function safe(fn, fb) { try { const v = fn(); if (v !== undefined) return v; } catch (e) {} return fb === undefined ? null : fb; }

  /**
   * 主入口：采样生成注入段落
   * opts: { limit, diceSides, randomFn, recentText, state, relevanceFilter }
   * relevanceFilter: 'on'（默认，先过滤相关再采样）| 'off'（全量采样）
   * @returns {Array} 选中的 pmem 条目（按原序）
   */
  // v2.4.0: 回落留痕——「读到的采样参数不可解析」必须可观测，否则用户改了设置却看到旧行为无从排查
  const __msStat = { fallbacks: 0, lastField: null, lastRaw: null };
  function pickInt(raw, def, field) {
    if (raw === undefined || raw === null) { __msStat.fallbacks++; __msStat.lastField = field; __msStat.lastRaw = String(raw); return def; }
    const n = parseInt(raw, 10);
    if (!isFinite(n)) { __msStat.fallbacks++; __msStat.lastField = field; __msStat.lastRaw = String(raw).slice(0, 24); return def; }
    return n;   // 含显式 0：交由调用方 clamp 决定区间语义，不再被 `||` 吞掉
  }
  // v0.9.9: 从 backstage 设置读取采样参数（未配置时回落内置默认值）
  function loadSamplerSettings() {
    const fallback = { memSamplerLimit: DEFAULT_LIMIT, memSamplerDice: DEFAULT_DICE_SIDES, memSamplerRelevance: 'on' };
    try {
      const st = (WA.backstage && WA.backstage.getSettings) ? WA.backstage.getSettings() : null;
      if (st) return {
        // v2.4.0: `parseInt(x) || fallback` 会把**显式配置的 0** 当成「没配」而回落，
        //   也会把 undefined（旧存档缺子键）与 NaN（手改脏值）一并吞掉而不留痕。
        //   改为：只有「不可解析」才回落，并在回落时记一笔（诊断可见）。
        memSamplerLimit: pickInt(st.memSamplerLimit, fallback.memSamplerLimit, 'memSamplerLimit'),
        memSamplerDice: pickInt(st.memSamplerDice, fallback.memSamplerDice, 'memSamplerDice'),
        memSamplerRelevance: st.memSamplerRelevance === 'off' ? 'off' : 'on'
      };
    } catch (e) {}
    return fallback;
  }
  function sampleEntries(opts) {
    const o = opts || {};
    const cfg = loadSamplerSettings();
    const st = o.state || safe(function () { return WA.store.get(); }, null) || {};
    const pmem = (st.memory && st.memory.pmem) || [];
    if (!pmem.length) return [];
    const limit = clamp(parseInt(o.limit) || cfg.memSamplerLimit, MIN_LIMIT, MAX_LIMIT);
    const diceSides = clamp(parseInt(o.diceSides) || cfg.memSamplerDice, MIN_SIDES, MAX_SIDES);
    const relevance = (o.relevanceFilter === 'off' || o.relevanceFilter === 'on') ? o.relevanceFilter : cfg.memSamplerRelevance;
    const hay = buildHaystack(o.recentText, st);
    let candidates = pmem;
    if (relevance !== 'off') {
      const rel = filterRelevant(pmem, hay);
      // 相关条目不足以填满 limit 时，用全量回退补足（不丢早期关键记忆）
      candidates = rel.length >= Math.min(limit, 3) ? rel : pmem;
    }
    return exponentialSample(candidates, limit, o.randomFn, diceSides);
  }

  /**
   * 生成注入文本（替代 pmem.buildBlock 的 slice(-8) 逻辑，可平滑切换）
   * opts 同 sampleEntries，另支持 header 自定义
   */
  function buildBlock(opts) {
    const picked = sampleEntries(opts);
    if (!picked.length) return '';
    const header = (opts && opts.header) ||
      '【人物主观记忆】以下为人物各自的认知，可能与客观事实不符；认知强度按原文保留（怀疑≠确信），不得让任何人物"全知"：';
    const lines = picked.map(function (e) {
      const who = ((e && e.holders) || []).join('/');
      return '- ' + who + '：' + clean(e && e.text) + (e && e.time ? '（' + e.time + '）' : '');
    });
    return header + '\n' + lines.join('\n');
  }

  WA.memorySampler = {
    DEFAULT_DICE_SIDES: DEFAULT_DICE_SIDES, MIN_SIDES: MIN_SIDES, MAX_SIDES: MAX_SIDES,
    DEFAULT_LIMIT: DEFAULT_LIMIT, MIN_LIMIT: MIN_LIMIT, MAX_LIMIT: MAX_LIMIT,
    exponentialSample: exponentialSample,
    loadSamplerSettings: loadSamplerSettings,
    /** v2.4.0: 采样配置回落留痕（诊断消费） */
    samplerCfgStat() { return { fallbacks: __msStat.fallbacks, lastField: __msStat.lastField, lastRaw: __msStat.lastRaw }; },
    safe: safe,  // v0.1.12: 导出供语义一致性单测
    filterRelevant: filterRelevant,
    buildHaystack: buildHaystack,
    sampleEntries: sampleEntries,
    buildBlock: buildBlock
  };
  if (WA.log) WA.log('info', '记忆注入采样器已加载');
})();
