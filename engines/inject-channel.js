/**
 * WorldAxis engines/inject-channel.js (v0.1.1) — 注入槽位路由（纯只读）
 *
 * 解决的问题：before 链各节点（连续性约束/章节/直接事件/仇敌大势/演化状态）
 * 推入 ctx.injections 时都带 position: 'after_last_user' + depth，
 * 但 render/inject.js 的 applyInjections 把所有项无差别合并成一个字符串，
 * 用同一个 setExtensionPrompt('WorldAxis', combined, 1, 0, false) 落地——
 * position/depth 完全被忽略，深度分层形同虚设。
 *
 * 本模块把「位置+深度」映射到 SillyTavern 的独立注入槽位（extension prompt slot）：
 *   - 不同 position → 不同槽位，互不覆盖
 *   - 同 position 不同 depth → 同槽位内按深度排序后合并
 * 预算裁决仍只作用于主槽位（世界状态那一路），剧情约束槽位不被预算裁掉。
 *
 * 只读保证：不写 store，不调用 setExtensionPrompt（落地仍由 render/inject 做）。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  // SillyTavern 注入位置常量（与宿主 setExtensionPrompt 的 position 参数对齐）
  const POS = {
    after_last_user: 1,   // 最后一条用户消息之后（剧情约束类）
    in_chat: 0,           // 聊天开头（世界状态类）
    at_end: 2             // 聊天末尾
  };
  const DEFAULT_POS = 'in_chat';
  const SLOT_PREFIX = 'WorldAxis';

  /** 规范化 position：未知值回落到 in_chat */
  function normPos(p) {
    return (typeof p === 'string' && POS.hasOwnProperty(p)) ? p : DEFAULT_POS;
  }

  /**
   * 把注入项按 position 分桶，桶内按 depth 升序合并
 * @param {Array} items  [{source, content, position?, depth?}]
   * @returns {Array} [{ slot, position, depth, items: [...] }] 每桶一项
   */
  function routeBySlot(items) {
    const buckets = {};
    (items || []).forEach(function (i) {
      if (!i || !i.content) return;
      const pos = normPos(i.position);
      if (!buckets[pos]) buckets[pos] = [];
      buckets[pos].push({
        source: i.source || '?',
        content: i.content,
        depth: (typeof i.depth === 'number') ? i.depth : 5
      });
    });
    return Object.keys(buckets).map(function (pos) {
      const list = buckets[pos].sort(function (a, b) { return a.depth - b.depth; });
      return { slot: SLOT_PREFIX + ':' + pos, position: pos, items: list };
    });
  }

  /**
   * 计算每个槽位的合并文本（桶内按深度顺序拼接）
   * @returns {Array} [{ slot, position, depth, text }]
   */
  function planSlots(items) {
    return routeBySlot(items).map(function (b) {
      return {
        slot: b.slot,
        position: b.position,
        depth: b.items[0].depth,
        // v2.47.0: 带上桶内成员——落地快照靠它回答「这条约束最后进了哪个槽位」，
        //   此前只留 slot 与 text，源身份在快照里无迹可查。
        items: b.items.map(function (i) { return { source: i.source, depth: i.depth, chars: String(i.content || '').length }; }),
        text: b.items.map(function (i) { return i.content; }).join('\n')
      };
    });
  }

  /**
   * 应用槽位计划：对每个槽位调用一次 setExtensionPrompt
 * @param {function} setExt  (slotName, text, position, depth, scan) => void
   * @param {Array} slots      planSlots 的输出
   */
  /**
   * 应用槽位计划：对每个槽位调用一次 setExtensionPrompt
   * v0.1.9: 逐槽位 try-catch——单个槽位失败不中断其余槽位，并收集错误信息
   * @param {function} setExt  (slotName, text, position, depth, scan) => void
   * @param {Array} slots      planSlots 的输出
   * @returns {{applied:number, total:number, errors:Array}} applied=成功落地的槽位数
   */
  function applySlots(setExt, slots) {
    const list = slots || [];
    if (typeof setExt !== 'function') return { applied: 0, total: list.length, landed: [], errors: [{ slot: '(all)', detail: 'setExt 不是函数' }] };
    let applied = 0;
    const errors = [];
    // v2.47.0: 记**成功名单**。此前只回 applied 计数，失败名单无出口 ⇒ 下游只能按
    //   「前 N 个成功」猜——而失败可能发生在任意位置（实测：第 1 个抛异常、第 2 个成功时，
    //   快照把成功的那个记成「未落地」，把真出错的漏掉，排查方向被彻底带偏）。
    const landed = [];
    list.forEach(function (s) {
      try {
        setExt(s.slot, s.text, POS[s.position], s.depth, false);
        applied++;
        landed.push(s.slot);
      } catch (e) {
        errors.push({ slot: s.slot, position: s.position, depth: s.depth, detail: String(e && (e.message || e)) });
      }
    });
    return { applied: applied, total: list.length, landed: landed, errors: errors };
  }

  WA.injectChannel = {
    POS: POS, DEFAULT_POS: DEFAULT_POS, SLOT_PREFIX: SLOT_PREFIX,
    normPos: normPos, routeBySlot: routeBySlot, planSlots: planSlots, applySlots: applySlots
  };
  if (WA.log) WA.log('info', '注入槽位路由已加载');
})();
