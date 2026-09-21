/**
 * WorldAxis engines/limits.js (v0.5)
 * 输出字数限制体系 + 事件链ID稳定规则 + stall停滞标记
 * 缝合来源：DlSNlGHT World —— world-engine-evolution.js 输出规范
 *
 * 字数上限（汉字计）：
 *   events.desc          ≤ 50
 *   events.title         ≤ 30
 *   factions.currentGoal ≤ 50
 *   factions.name        ≤ 8
 *   winds.content        ≤ 50
 *   winds.topic          ≤ 10
 *   worldTrends.desc     ≤ 100
 *   people.name          ≤ 10
 *   knowledge.content    ≤ 80
 *   news.title           ≤ 20
 *   forums.title         ≤ 25
 *
 * ID稳定规则：
 *   - API返回的id若已存在则必须原样使用，不得重新生成
 *   - 改名不换链：title变更时保留原id
 *   - type一旦确定禁改：conflict/progress不可互换
 *   - stall标记：非终局，原因写入desc，stage保持当前
 */
(function () {
  const WA = (window.WorldAxis = window.WorldAxis || {});

  // ── 字数上限表 ─────────────────────────────────────────
  const LIMITS = {
    'events.title':         30,
    'events.desc':          50,
    'factions.name':         8,
    'factions.currentGoal': 50,
    'winds.topic':          10,
    'winds.content':        50,
    'worldTrends.desc':    100,
    'people.name':          10,
    'knowledge.content':    80,
    'news.title':           20,
    'forums.title':         25,
    'chronicle.title':      30,
    'chronicle.desc':       50
  };

  // ── 核心截断函数 ───────────────────────────────────────
  /**
   * @param {string} path  点路径，如 'events.desc'
   * @param {*} value
   * @returns {*} 截断后的值（非字符串原样返回）
   */
  function clamp(path, value) {
    const limit = LIMITS[path];
    if (!limit || typeof value !== 'string') return value;
    if (value.length <= limit) return value;
    WA.log('info', `limits: ${path}超长(${value.length}>${limit})，已截断`);
    return value.slice(0, limit - 1) + '…';
  }

  /**
   * 批量截断对象数组
   * @param {string} prefix  路径前缀，如 'events'
   * @param {Array} arr
   * @param {string[]} fields  需要检查的字段名
   */
  function clampArray(prefix, arr, fields) {
    if (!Array.isArray(arr)) return arr;
    return arr.map(item => {
      if (!item || typeof item !== 'object') return item;
      const out = Object.assign({}, item);
      fields.forEach(f => {
        if (out[f] !== undefined) out[f] = clamp(`${prefix}.${f}`, out[f]);
      });
      return out;
    });
  }

  // ── backstage结果整体截断 ──────────────────────────────
  /**
   * 对backstage返回的result对象应用全部字数限制
   */
  function clampBackstageResult(r) {
    if (!r || typeof r !== 'object') return r;
    const out = Object.assign({}, r);

    if (out.events_create) out.events_create = clampArray('events', out.events_create, ['title', 'desc']);
    if (out.events_update) out.events_update = clampArray('events', out.events_update, ['title', 'desc']);
    if (out.factions)      out.factions      = clampArray('factions', out.factions, ['name', 'currentGoal']);
    if (out.winds)         out.winds         = clampArray('winds', out.winds, ['topic', 'content']);
    if (out.worldTrends)   out.worldTrends   = clampArray('worldTrends', out.worldTrends, ['desc']);
    if (out.people)        out.people        = clampArray('people', out.people, ['name']);
    if (out.knowledge_updates) out.knowledge_updates = clampArray('knowledge', out.knowledge_updates, ['content']);
    if (out.news)          out.news          = clampArray('news', out.news, ['title']);
    if (out.forums)        out.forums        = clampArray('forums', out.forums, ['title']);

    return out;
  }

  // ── 事件链ID稳定 ───────────────────────────────────────
  /**
   * 更新事件时保持ID稳定：
   *  - 若update含id且已存在，直接定位
   *  - 若update含title，按title匹配已有事件（改名不换链）
   *  - type禁改：若已存在事件的type与update不同，忽略type字段
   * @param {Array} existing  现有事件数组
   * @param {object} update   backstage返回的events_update单条
   * @returns {{idx:number, stable:boolean}} idx=-1表示未匹配
   */
  function locateStable(existing, update) {
    if (!Array.isArray(existing) || !update) return { idx: -1, stable: false };

    // 按id精确匹配
    if (update.id) {
      const idx = existing.findIndex(e => e && WA.store.sameId(e.id, update.id)); // v2.30.0 P1-1 收口
      if (idx >= 0) return { idx, stable: true };
    }

    // 按title匹配（改名不换链）
    if (update.title) {
      const idx = existing.findIndex(e => e && e.title && e.title === update.title);
      if (idx >= 0) return { idx, stable: true };
    }

    return { idx: -1, stable: false };
  }

  /**
   * 应用单条事件更新，遵守ID稳定+type禁改规则
   * @param {object} existing  现有事件对象（原地修改）
   * @param {object} update
   */
  function applyStableUpdate(existing, update) {
    if (!existing || !update) return;
    const skip = new Set(['id', 'type']); // 不允许覆盖的字段
    Object.keys(update).forEach(k => {
      if (skip.has(k)) return;
      if (update[k] !== undefined && update[k] !== null) {
        existing[k] = update[k];
      }
    });
    // stall标记：非终局，原因写入desc
    if (update.stall && update.stallReason) {
      existing.stall = true;
      existing.desc  = String(update.stallReason).slice(0, LIMITS['events.desc'] || 50);
    } else if (update.stall === false) {
      existing.stall = false;
    }
  }

  // ── 暴露 ───────────────────────────────────────────────
  WA.limits = { LIMITS, clamp, clampArray, clampBackstageResult, locateStable, applyStableUpdate };
})();