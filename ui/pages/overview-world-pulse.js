/**
 * WorldAxis ui/pages/overview-world-pulse.js (v2.414.0) — 概览页「世界脉搏」聚合块（OPV24-1）
 *
 * ── 它治什么 ────────────────────────────────────────────────────
 *   全开策略（v2.412.0）之后，116 个机制全部运转，但玩家在概览页只能看到
 *   通用诊断（容量/随机源/时间源/心跳…），看不到「世界这轮到底动了什么」——
 *   伏笔悬了几条、暗线开了几案、谁在幕后生活、这一轮有什么可选动向。
 *   数据全在账本里，缺的只是一块玩家一眼能读完的聚合视图。
 *
 * ── 装配点 ──────────────────────────────────────────────────────
 *   挂进概览页玩家汇总（ui/pages/overview-main.js 的 renderOverview），
 *   不新增页面、不新增楼层组件——玩家打开面板即见。
 *
 * ── 口径（与 ui/pages/overview-blocks.js 同一条契约）────────────
 *   1 零控件：只拼 HTML 字符串，不建 DOM、不绑事件、不产生 id。
 *   2 零世界写：只读 WA.foreshadow / WA.threads / WA.enigma / WA.longline /
 *     WA.causal / WA.stagePresence / WA.opportunity / WA.injectBudget 的既有读口。
 *   3 外部依赖只走注入：顶层零 require、零 module.exports——ui/*.js 全部由
 *     vm.runInContext 装载，自挂 WA.<ns>。esc 由 panel.js 经 bind({esc}) 注入，
 *     缺席时兜底成恒等（可见的裸 <，而不是静默看起来正常）。
 *   4 缺模块返回空串：某引擎缺席（未装载/被禁用）时该段返回空串——
 *     缺席好于假值，绝不在此兜底造读数。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  let esc = function (s) { return String(s == null ? '' : s); };
  /** 注入外部符号。幂等；返回 API 便于链式调用。非函数不接。 */
  function bind(ctx) {
    if (!ctx) return API;
    if (typeof ctx.esc === 'function') esc = ctx.esc;
    return API;
  }
  /** 薄壳：读数段一律 try 包住——单引擎抛错不拖垮整块，坏段给可见的降级行。 */
  function sect(fn) {
    try { return fn(); } catch (e) {
      return '<div class="wa-dim">世界脉搏·一段读数失败：' + esc(String((e && e.message) || e)).slice(0, 80) + '</div>';
    }
  }
  const DIM0 = '<div class="wa-dim" style="opacity:0.6;font-size:11px;">';
  const DIM1 = '<div class="wa-dim" style="opacity:0.75;font-size:11px;">';
  const sub = function (s) { return DIM1 + '· ' + esc(String(s == null ? '' : s).slice(0, 46)) + '</div>'; };

  /** ── 伏笔段：在途计数 + 最久三条的标题人话 ── */
  function foreshadowSect() {
    if (!WA.foreshadow || typeof WA.foreshadow.stat !== 'function') return '';
    return sect(function () {
      const st = WA.foreshadow.stat();
      if (!st || !st.total) return DIM0 + '伏笔：暂无（世界还没有埋下任何线）</div>';
      const act = st.active || 0;
      let out = '<div>伏笔：在途 <b>' + esc(act) + '</b> / 累计 ' + esc(st.total)
        + '（已回收 ' + esc(st.triggered || 0) + '·终局 ' + esc(st.closed || 0) + '）'
        + (st.stale ? '<span style="opacity:0.7;">，' + esc(st.stale) + ' 条已搁置过久</span>' : '') + '</div>';
      let rows = [];
      try {
        if (typeof WA.foreshadow.list === 'function') {
          rows = (WA.foreshadow.list() || []).filter(function (f) {
            return f && f.status && WA.foreshadow.ACTIVE && WA.foreshadow.ACTIVE.indexOf(f.status) >= 0;
          }).sort(function (a, b) { return (a.updatedAt || a.at || 0) - (b.updatedAt || b.at || 0); }).slice(0, 3);
        }
      } catch (e) { rows = []; }
      rows.forEach(function (f) {
        const ttl = f.title || f.text || f.name || f.summary || '';
        if (ttl) out += sub(ttl + '（' + f.status + '）');
      });
      // 回收时机提示（OPV25-T2-1）：check() 是引擎的**只读**扫描口（panel.js 已有同款消费，
      //   内部只动模块内 stat 计数、不写世界）。逾期行给「超阈值未推进 N 条 + 最久一条」人话，
      //   阈值从返回值读（thresholdMs），不在此硬编码——口径单一真源。
      try {
        if (typeof WA.foreshadow.check === 'function') {
          const ck = WA.foreshadow.check();
          if (ck && ck.ok && ck.count) {
            const hr = (ck.thresholdMs >= 3600000)
              ? Math.round(ck.thresholdMs / 3600000) + '小时'
              : Math.max(1, Math.round(ck.thresholdMs / 60000)) + '分钟';
            const r0 = ck.rows[0] || {};
            out += '<div class="wa-dim" style="opacity:0.75;font-size:11px;">回收时机：' + esc(ck.count)
              + ' 条超 ' + esc(hr) + ' 未推进，最久「' + esc(String(r0.content || '').slice(0, 24)) + '」</div>';
          }
        }
      } catch (e) { /* 扫描缺席不打紧，主行已成立 */ }
      return out;
    });
  }

  /** ── 暗线段：threads 悬案 + enigma 知情 exclusivity ── */
  function threadsSect() {
    if (!WA.threads || typeof WA.threads.threadStat !== 'function') return '';
    return sect(function () {
      const ts = WA.threads.threadStat();
      if (!ts || !ts.cases) return DIM0 + '暗线：暂无悬案</div>';
      let out = '<div>暗线：悬案 <b>' + esc(ts.open) + '</b> / 停滞 ' + esc(ts.stalled) + '（已收口 ' + esc(ts.resolved) + '·弃 ' + esc(ts.abandoned) + '），线索共 ' + esc(ts.leads) + ' 条</div>';
      // 只读明细：逐案一行「问题[状态]：最新线索」。只读，无控件（details 不在本仓控件判据内，
      //   与 overview-main 的两个折叠壳同款）。openCase/resolve 等写口仍归引擎与正文侧。
      try {
        if (typeof WA.threads.list === 'function') {
          const live = (WA.threads.list() || []).filter(function (x) { return x && (x.status === 'open' || x.status === 'stalled'); }).slice(0, 5);
          if (live.length) {
            let rows = '';
            live.forEach(function (t) {
              const ls = (Array.isArray(t.leads) ? t.leads : []);
              const last = ls.length ? ls[ls.length - 1] : null;
              rows += '<div style="opacity:0.7;font-size:11px;">· ' + esc(String(t.question || t.title || t.id || '').slice(0, 36)) + '[' + esc(t.status) + ']：'
                + esc(last ? (String(last.claim || '') + '（' + String(last.source || '') + '／' + String(last.reliability || '') + '）').slice(0, 50) : '尚无线索') + '</div>';
            });
            out += '<details class="wa-details" style="margin:2px 0 4px;"><summary style="cursor:pointer;opacity:0.7;font-size:11px;">展开逐案明细（' + live.length + '）</summary>' + rows + '</details>';
          }
        }
      } catch (e) { /* 明细缺席不打紧，主行已成立 */ }
      try {
        if (typeof WA.enigma !== 'undefined' && WA.enigma && typeof WA.enigma.stat === 'function') {
          const es = WA.enigma.stat();
          if (es && (es.total || es.marked)) out += sub('知情隔离：' + (es.total || es.marked) + ' 处（圈外人数 ' + (es.outsiders || 0) + '）');
        }
      } catch (e) { /* enigma 缺席不打紧，暗线主行已成立 */ }
      return out;
    });
  }

  /** ── 幕后生活段：stagePresence 在场/退场读数 ── */
  function stageSect() {
    if (!WA.stagePresence || typeof WA.stagePresence.stat !== 'function') return '';
    return sect(function () {
      const st = WA.stagePresence.stat();
      if (!st) return '';
      const on = st.onstageCount || 0;
      const ticks = st.offstageTicks || 0;
      const reu = st.reunionsAwakened || 0;
      if (!on && !ticks && !reu) return DIM0 + '幕后生活：暂无退场角色在积累生活</div>';
      return '<div>幕后生活：在场 ' + esc(on) + ' 人，退场推进 ' + esc(ticks) + ' 轮次，重逢唤醒 ' + esc(reu) + ' 次</div>';
    });
  }

  /** ── 机会动向段：可应答卡片（take/defer/decline 三键，panel 委托绑定，本模块零控件契约不变）── */
  function opportunitySect() {
    if (!WA.opportunity || typeof WA.opportunity.list !== 'function') return '';
    return sect(function () {
      const rows = (WA.opportunity.list() || []).slice(0, 3);
      if (!rows.length) return DIM0 + '机会动向：暂无可选动向（世界在等你的下一步）</div>';
      let out = '<div>机会动向：在途 <b>' + esc(rows.length) + '</b> 条</div>';
      rows.forEach(function (v) {
        const ttl = v.title || v.text || v.name || v.summary || v.id || '';
        if (!ttl) return;
        out += '<div class="wa-dim" style="opacity:0.75;font-size:11px;margin-top:2px;">· ' + esc(String(ttl).slice(0, 40)) + (v.stage ? '（' + esc(v.stage) + '）' : '')
          + ' <button type="button" data-op-act="defer" data-op-id="' + esc(v.id || '') + '" style="font-size:10px;padding:0 6px;margin-left:4px;cursor:pointer;">缓办（1天）</button>'
          + ' <button type="button" data-op-act="decline" data-op-id="' + esc(v.id || '') + '" style="font-size:10px;padding:0 6px;cursor:pointer;">放弃</button></div>';
      });
      // 「接下」不放这里：respond('take') 需要真实行动者与目标（act.add 在正文侧排队），
      //   面板凭空编人等于替世界伪造行动 —— 接下请在正文里回应，模型会看到机会块并替行动者处理。
      return out + '<div class="wa-dim" style="opacity:0.55;font-size:10px;">接下请在正文里回应（世界按行动者排队）；此处只做缓办与放弃。</div>';
    });
  }

  /** ── 故事分支段：待决选择点 + 选项按钮（走 storyChoice.confirm，panel 委托绑定）── */
  function storySect() {
    if (!WA.storyChoice || typeof WA.storyChoice.pending !== 'function') return '';
    return sect(function () {
      let pts = [];
      try { const p = WA.storyChoice.pending(); pts = (p && p.ok && p.points) ? p.points : []; } catch (e) { pts = []; }
      if (!pts.length) return '';
      let out = '<div>故事分支：待决 <b>' + esc(pts.length) + '</b> 处</div>';
      pts.slice(0, 3).forEach(function (pt) {
        let opts = [];
        try {
          const rv = (typeof WA.storyChoice.review === 'function') ? WA.storyChoice.review(pt.id) : null;
          // OPV25-T2-2a：不再滤掉 allowed:false——预演未过的选项**可见但不可点**（见下）。
          opts = (rv && rv.ok && rv.options) ? rv.options.filter(function (o) { return o && o.label; }).slice(0, 4) : [];
        } catch (e) { opts = []; }
        out += '<div class="wa-dim" style="opacity:0.75;font-size:11px;margin-top:2px;">· ' + esc(String(pt.prompt || pt.id || '').slice(0, 40)) + '</div>';
        opts.forEach(function (o) {
          // 预演未过（present 阶段 rehearsal.preview 校验失败）⇒ 纯文本展示，不给按钮——
          //   点了也必被 confirm 拒收（preview-rejected），如实标注走不通比诱导点击诚实。
          if (o.allowed === false || (o.preview && o.preview.ok === false)) {
            out += '<div style="font-size:10px;margin:2px 0 2px 8px;opacity:0.5;">· ' + esc(String(o.label).slice(0, 18)) + (o.costs ? '（' + esc(String(o.costs).slice(0, 12)) + '）' : '') + '〔预演未过，走不通〕</div>';
            return;
          }
          out += ' <button type="button" data-sc-id="' + esc(pt.id || '') + '" data-sc-opt="' + esc(o.label) + '" style="font-size:10px;padding:0 6px;margin:2px 4px 2px 8px;cursor:pointer;">' + esc(String(o.label).slice(0, 18)) + (o.costs ? '（' + esc(String(o.costs).slice(0, 12)) + '）' : '') + '</button>';
        });
      });
      // 分支树计数行（OPV25-T2-2b）：已决/未决一眼看清——玩家知道自己的选择都被记着账。
      try {
        if (WA.branchTree && typeof WA.branchTree.stat === 'function') {
          const bs = WA.branchTree.stat();
          if (bs && bs.nodes) out += sub('分支树：' + bs.nodes + ' 个节点（已决 ' + (bs.withChoice || 0) + '·根 ' + (bs.roots || 0) + '）');
        }
      } catch (e) { /* 树统计缺席不打紧，主行已成立 */ }
      return out;
    });
  }

  /** ── 长线因果段：longline 誓约/逾期 + causal 活动链 ── */
  function longlineSect() {
    let out = '';
    if (WA.longline && typeof WA.longline.stat === 'function') {
      out += sect(function () {
        const st = WA.longline.stat();
        if (!st) return '';
        const keys = Object.keys(st);
        const n = keys.filter(function (k) { return typeof st[k] === 'number' && st[k] > 0; }).length;
        const interesting = (st.active != null) ? st.active : (st.open != null) ? st.open : null;
        if (interesting == null && !n) return DIM0 + '长线：暂无进行中的誓约</div>';
        return '<div>长线：进行中 <b>' + esc(interesting != null ? interesting : n) + '</b> 条' + (st.overdue ? '，逾期 ' + esc(st.overdue) : '') + '</div>';
      });
    }
    if (WA.causal && typeof WA.causal.stateView === 'function') {
      out += sect(function () {
        const sv = WA.causal.stateView();
        if (!sv) return '';
        const chains = sv.chains || sv.chainsCount || (Array.isArray(sv) ? sv.length : 0);
        const act = sv.active || sv.open || 0;
        if (!chains && !act) return DIM0 + '因果链：暂无活动链</div>';
        return '<div>因果链：活动 <b>' + esc(act || chains) + '</b> 条' + (sv.settled ? '（已结算 ' + esc(sv.settled) + '）' : '') + '</div>';
      });
    }
    return out;
  }

  /** ── 本轮注入段：预算裁决读数（谁被折叠/丢弃一目了然）── */
  function budgetSect() {
    if (!WA.injectBudget || typeof WA.injectBudget.volumeView !== 'function') return '';
    return sect(function () {
      const v = WA.injectBudget.volumeView();
      if (!v) return '';
      const parts = [];
      if (v.planned != null) parts.push('计划 ' + v.planned);
      if (v.folded) parts.push('折叠 ' + v.folded);
      if (v.dropped) parts.push('丢弃 ' + v.dropped);
      if (v.kept) parts.push('保留 ' + v.kept);
      if (!parts.length) return DIM0 + '本轮注入：暂无裁决读数（世界还没开口）</div>';
      return '<div>本轮注入：' + esc(parts.join('·')) + '</div>';
    });
  }

  /**
   * 聚合块：按「世界在动什么」的顺序拼六段。
   * 全部段都为空时返回空串——本块整体缺席，不给面板留空白框。
   */
  function worldPulseBlock() {
    const body = foreshadowSect() + threadsSect() + stageSect() + storySect() + opportunitySect() + longlineSect() + budgetSect();
    if (!body) return '';
    // wa-pulse-res：机会应答的结果回显行。常在场（登记 ids 层的理由：它是「块渲染了但
    //   id 写错」这类断裂的观测点，与 wa-first-out 的先例同规格——面板回显，不是控件）。
    //   值由 panel.js 的委托绑定写入（opportunity.respond 的结果原文），本模块只留位置。
    return '<div class="wa-sec">世界脉搏<span class="wa-dim">（世界这轮动了什么，一眼读完）</span></div>'
      + '<div style="margin:4px 0 8px;">' + body
      + '<div id="wa-pulse-res" class="wa-dim" style="opacity:0.8;font-size:11px;min-height:14px;"></div></div>';
  }

  const API = {
    worldPulseBlock: worldPulseBlock,
    bind: bind,
    ver: '2.414.0'
  };
  WA.panelWorldPulse = API;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/overview-world-pulse.js', { kind: 'ui', ver: '2.414.0' });
  }
})();