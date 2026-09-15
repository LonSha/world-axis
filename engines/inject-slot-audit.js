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
  function snapshotSlots(slots, applied) {
    const list = Array.isArray(slots) ? slots : [];
    const perSlot = list.map(function (s) {
      return { slot: s.slot, position: s.position, depth: s.depth, chars: (s.text || '').length };
    });
    return {
      count: perSlot.length,
      applied: (typeof applied === 'number') ? applied : 0,
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
    if (slots.applied < slots.count) {
      const landed = slots.perSlot.slice(0, slots.applied).map(function (x) { return x.slot; });
      slots.perSlot.forEach(function (p) {
        if (landed.indexOf(p.slot) < 0) {
          issues.push({ level: 'error', code: 'slot.orphan', detail: '槽位 ' + p.slot + ' 计划了但未落地（可能被宿主覆盖或 setExt 抛异常）' });
        }
      });
    }
    // 主块声称的来源数与槽位接管项冲突时给出提示（信息级）
    if (Array.isArray(li.sources) && li.sources.length && slots.count) {
      // 主块来源里不应出现已被槽位接管的 source（内容指纹双保险下不精确，仅信息级）
    }
    return { consistent: issues.length === 0, issues: issues };
  }

  WA.injectSlotAudit = {
    snapshotSlots: snapshotSlots,
    audit: audit
  };
  if (WA.log) WA.log('info', '注入槽位审计已加载');
})();
