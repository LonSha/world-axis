/**
 * WorldAxis engines/inject-slot-audit.js (v0.1.3) — 注入槽位落地审计（纯只读）
 *
 * 解决的问题：v0.1.1 引入槽位路由后，render/inject.js 的 lastInjection 快照
 * 只记录主块信息（len/sources/budget），完全遗漏了独立槽位的落地情况——
 * 排查「约束注入丢了」时无法区分「路由失败并入主块」与「路由成功但槽位被宿主覆盖」。
 *
 * 本模块提供槽位落地的快照采集与对账：
 *   - snapshotSlots(plan, applied) 采集槽位计划与实际落地结果
 *   - audit(lastInjection) 对账：主块与槽位是否一致、有无孤儿槽位
 * 只读保证：不写 store，不调用 setExtensionPrompt。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  /**
   * 采集槽位落地快照
   * @param {Array} slots     planSlots 的输出 [{slot, position, depth, text}]
   * @param {number} applied  applySlots 实际成功数
   * @returns {Object} { count, keys, totalChars, perSlot }
   */
  /**
   * 采集槽位落地快照
   * @param {Array} slots     planSlots 的输出 [{slot, position, depth, text, items?}]
   * @param {number|Object} applied  applySlots 的实际结果：
   *   兼容两种入参——数字（旧：只给计数）或 applySlots 返回值（新：含 landed 成功名单）。
   *   v2.47.0: 只给计数时 `landed` 置 null（**不猜**）；给了名单就逐项核对。
   *   见 audit() 里「归因不得靠猜」的说明。
   * @returns {Object} { count, applied, landed, keys, totalChars, perSlot }
   */
  function snapshotSlots(slots, applied) {
    const list = Array.isArray(slots) ? slots : [];
    const apObj = (applied && typeof applied === 'object') ? applied : null;
    const landedArr = apObj && Array.isArray(apObj.landed) ? apObj.landed : null;
    const apNum = (typeof applied === 'number') ? applied : ((apObj && typeof apObj.applied === 'number') ? apObj.applied : 0);
    const perSlot = list.map(function (s) {
      const items = Array.isArray(s.items) ? s.items : [];
      return {
        slot: s.slot, position: s.position, depth: s.depth, chars: (s.text || '').length,
        // v2.47.0: 记「这一槽位由哪些源拼成」——快照此前只留 key 与字数，
        //   「某项约束到底进没进正文」在快照里无迹可查
        sources: items.map(function (x) { return (x && x.source) || '?'; }),
        itemCount: items.length
      };
    });
    return {
      count: perSlot.length,
      applied: apNum,
      landed: landedArr ? landedArr.slice() : null,
      keys: perSlot.map(function (x) { return x.slot; }),
      totalChars: perSlot.reduce(function (sum, x) { return sum + x.chars; }, 0),
      perSlot: perSlot
    };
  }

  /**
   * 对账：主块快照与槽位快照是否一致
   * @param {Object} lastInjection  store.lastInjection（含 slots 字段时才对账）
   * @returns {Object} { consistent, issues:[] }
   */
  function audit(lastInjection) {
    const issues = [];
    const li = lastInjection || {};
    const slots = li.slots;
    if (!slots || !Array.isArray(slots.perSlot)) {
      return { consistent: true, issues: issues, note: '无槽位快照（v0.1.1 前的旧记录或未启用路由）' };
    }
    // 已声明路由成功但槽位落地数与计划数不一致
    if (slots.count !== slots.applied) {
      issues.push({
        level: 'warn',
        code: 'slot.appliedMismatch',
        detail: '计划 ' + slots.count + ' 个槽位，实际落地 ' + slots.applied + ' 个'
      });
    }
    // 孤儿槽位：计划了但没落地
    //   v2.47.0: 归因**不得靠猜**。旧实现假定「前 applied 个成功、其余失败」，于是把
    //   实际失败了的那一项记成成功、把成功的记成「计划了但未落地」——用户照着这条去查
    //   一个根本没出错的槽位（实测：第 1 槽抛异常、第 2 槽正常时，报的是第 2 槽）。
    //   现在优先按 applySlots 交回的成功名单逐项核对；名单缺席（旧入参）时**不猜**，
    //   改为如实报「有几个不确定、且不知道是哪几个」，宁可少报也不误导。
    if (slots.applied < slots.count) {
      const landedList = Array.isArray(slots.landed) ? slots.landed : null;
      if (landedList) {
        slots.perSlot.forEach(function (p) {
          if (landedList.indexOf(p.slot) < 0) {
            issues.push({ level: 'error', code: 'slot.orphan', detail: '槽位 ' + p.slot + ' 计划了但未落地（可能被宿主覆盖或 setExt 抛异常）' });
          }
        });
      } else {
        issues.push({ level: 'error', code: 'slot.orphanUnknown', detail: '有 ' + (slots.count - slots.applied) + ' 个槽位未落地，但快照未记录成功名单，无法定位是哪几个（applySlots 未交回 landed）' });
      }
    }
    // 主块声称的来源数与槽位接管项冲突时给出提示（信息级）
    if (Array.isArray(li.sources) && li.sources.length && slots.count) {
      // 主块来源里不应出现已被槽位接管的 source（内容指纹双保险下不精确，仅信息级）
    }
    return { consistent: issues.length === 0, issues: issues };
  }

  /**
   * v0.1.42: 路由覆盖审计（只读）——同 position 多源合并时，桶深度取首项，
   * 其余项的显式 depth 会被静默覆盖；显式检出，避免多源约束在宿主排序语义上漂移。
   * @param {Array} items 原始注入项 [{source, position?, depth?, content?}]
   */
  function routeAudit(items) {
    const buckets = {};
    (items || []).forEach(function (i) {
      if (!i || !i.content) return;
      // 与真实路由同源：走 injectChannel.normPos（未知值回落 in_chat），模块缺席时兜底
      const norm = (WA.injectChannel && WA.injectChannel.normPos) ? WA.injectChannel.normPos : function (x) { return (typeof x === 'string' && x) ? x : 'in_chat'; };
      const pos = norm(i.position);
      (buckets[pos] = buckets[pos] || []).push(i);
    });
    const conflicts = [];
    Object.keys(buckets).forEach(function (pos) {
      const list = buckets[pos];
      if (list.length < 2) return;
      const depths = list.map(function (x) { return (typeof x.depth === 'number') ? x.depth : null; });
      const uniq = [];
      depths.forEach(function (d) { if (d !== null && uniq.indexOf(d) < 0) uniq.push(d); });
      if (uniq.length > 1) {
        const effective = (typeof list[0].depth === 'number') ? list[0].depth : null;
        conflicts.push({
          position: pos,
          slot: 'WorldAxis' + ':' + pos,
          sources: list.map(function (x) { return x.source || '?'; }),
          depths: depths,
          effective: effective,
          detail: '同 position 多源深度不一致，桶深度取首项 ' + effective + '，其余 ' + (uniq.length - 1) + ' 个显式 depth 被覆盖'
        });
      }
    });
    return { positions: Object.keys(buckets).length, conflicts: conflicts };
  }

  WA.injectSlotAudit = {
    snapshotSlots: snapshotSlots,
    audit: audit,
    routeAudit: routeAudit
  };
  if (WA.log) WA.log('info', '注入槽位审计已加载');
})();
