/**
 * WorldAxis core/unified-pending.js (v2.296.0) — 全仓统一待办中心（V10 OPV10-7）
 * 
 * 【它治什么】
 *   待办（pending）散落在 12+ 个独立业务模块中：
 *   storyChoice / commission / investigation / aftermath / operations / farfield /
 *   collab / coop / backstage / communityNote / deferToken / commit 等。
 *   此前没有任何只读聚合出口，玩家无法在一屏内获知“当前世界有哪些未决事务需要我决策或确认”。
 * 
 * 【设计纪律】
 *   ① 只读：不写 store，不触碰任何写事务，零副作用；
 *   ② 惰性安全查询：模块未加载或 disabled 时静默归零或标明 disabled，不崩溃；
 *   ③ 结构化输出：统一为 { id, module, kind, title, summary, actionKey, urgency } 格式；
 *   ④ 下钻支持：每条待办提供 module 与 targetPage，供 UI 一键跳转。
 */
(function () {
  'use strict';

  const WA = (typeof window !== 'undefined' && window.WorldAxis)
    ? window.WorldAxis
    : ((typeof global !== 'undefined' && global.WA) ? global.WA : {});

  /**
   * 待办收集聚合器
   */
  function collectPending() {
    const list = [];
    const now = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('unifiedPending') : Date.now();

    // 1. storyChoice (故事分支抉择)
    try {
      if (WA.storyChoice && typeof WA.storyChoice.pending === 'function') {
        const sc = WA.storyChoice.pending();
        if (sc && sc.ok && Array.isArray(sc.points)) {
          sc.points.forEach(function (pt) {
            list.push({
              id: 'sc:' + (pt.id || pt.choiceId || 'unknown'),
              module: 'storyChoice',
              targetPage: 'storyChoice',
              kind: 'choice',
              title: pt.title || '故事分支抉择',
              summary: pt.prompt || pt.desc || '等待选择故事走向',
              urgency: 'high',
              data: pt
            });
          });
        }
      }
    } catch (e) {}

    // 2. commission (委托任务)
    try {
      if (WA.commission && typeof WA.commission.pending === 'function') {
        const cm = WA.commission.pending();
        if (cm && cm.ok && Array.isArray(cm.items)) {
          cm.items.forEach(function (it) {
            list.push({
              id: 'cm:' + (it.id || 'unknown'),
              module: 'commission',
              targetPage: 'commission',
              kind: 'contract',
              title: it.title || '委托履约待验',
              summary: it.desc || '等待交付或验收',
              urgency: 'medium',
              data: it
            });
          });
        }
      }
    } catch (e) {}

    // 3. investigation (线索调查)
    try {
      if (WA.investigation && typeof WA.investigation.pending === 'function') {
        const iv = WA.investigation.pending();
        if (iv && iv.ok && Array.isArray(iv.items)) {
          iv.items.forEach(function (it) {
            list.push({
              id: 'iv:' + (it.id || 'unknown'),
              module: 'investigation',
              targetPage: 'investigation',
              kind: 'investigation',
              title: it.title || '线索调查定案',
              summary: it.clue || '等待定案裁决',
              urgency: 'medium',
              data: it
            });
          });
        }
      }
    } catch (e) {}

    // 4. aftermath (地点后果与修复)
    try {
      if (WA.aftermath && typeof WA.aftermath.pending === 'function') {
        const af = WA.aftermath.pending();
        if (af && af.ok && Array.isArray(af.items)) {
          af.items.forEach(function (it) {
            list.push({
              id: 'af:' + (it.id || 'unknown'),
              module: 'aftermath',
              targetPage: 'aftermath',
              kind: 'remediation',
              title: it.placeName ? (it.placeName + ' 后果处置') : '地点后果处理',
              summary: it.effect || '等待复访或修复',
              urgency: 'low',
              data: it
            });
          });
        }
      }
    } catch (e) {}

    // 5. operations (运营结算)
    try {
      if (WA.operations && typeof WA.operations.pending === 'function') {
        const op = WA.operations.pending();
        if (op && op.ok && Array.isArray(op.items)) {
          op.items.forEach(function (it) {
            list.push({
              id: 'op:' + (it.id || 'unknown'),
              module: 'operations',
              targetPage: 'operations',
              kind: 'project',
              title: it.name || '运营项目待批',
              summary: it.stage || '等待阶段推进或审批',
              urgency: 'medium',
              data: it
            });
          });
        }
      }
    } catch (e) {}

    // 6. farfield (远方脉搏在途)
    try {
      if (WA.farfield && typeof WA.farfield.pending === 'function') {
        const ff = WA.farfield.pending();
        if (ff && ff.ok && Array.isArray(ff.rows)) {
          ff.rows.forEach(function (it) {
            list.push({
              id: 'ff:' + (it.id || 'unknown'),
              module: 'farfield',
              targetPage: 'farfield',
              kind: 'farfield',
              title: '远方在途传闻: ' + (it.place || '未知'),
              summary: it.headline || it.summary || '在途消息等待传播抵达',
              urgency: 'low',
              data: it
            });
          });
        }
      }
    } catch (e) {}

    // 7. diplomacy (外交提案待答)
    try {
      if (WA.diplomacy && typeof WA.diplomacy.stat === 'function') {
        const dp = WA.diplomacy.stat();
        if (dp && dp.live && dp.live.open > 0 && typeof WA.diplomacy.view === 'function') {
          const v = WA.diplomacy.view();
          if (v && Array.isArray(v.proposals)) {
            v.proposals.filter(function (p) { return p.stage === 'proposed' || p.stage === 'countered'; }).forEach(function (p) {
              list.push({
                id: 'dp:' + p.id,
                module: 'diplomacy',
                targetPage: 'world',
                kind: 'treaty',
                title: '外交提案待答：' + (p.from || '某方') + ' → ' + (p.to || '某方'),
                summary: '条款: ' + (p.terms || []).map(function(t){ return t.label; }).join(', '),
                urgency: 'high',
                data: p
              });
            });
          }
        }
      }
    } catch (e) {}

    return {
      at: now,
      total: list.length,
      highCount: list.filter(function (x) { return x.urgency === 'high'; }).length,
      items: list
    };
  }

  /**
   * 诊断面（只读）
   */
  function diagnose() {
    const report = collectPending();
    return {
      ok: true,
      pendingCount: report.total,
      highUrgency: report.highCount,
      summary: '待办中心共登记 ' + report.total + ' 项（高优先级 ' + report.highCount + ' 项）'
    };
  }

  WA.unifiedPending = {
    collect: collectPending,
    pending: collectPending,
    diagnose: diagnose,
    stat: function () {
      const r = collectPending();
      return { total: r.total, high: r.highCount, at: r.at };
    }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('core/unified-pending.js', { kind: 'core', ver: '2.296.0' });
  }
})();
