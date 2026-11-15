/**
 * WorldAxis ui/pages/overview-world-pulse.js (v2.413.0) — 概览页「世界脉搏」聚合块（OPV24-1）
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

  /** ── 机会动向段：opportunity 在途卡片，标题 + 来源 ── */
  function opportunitySect() {
    if (!WA.opportunity || typeof WA.opportunity.list !== 'function') return '';
    return sect(function () {
      const rows = (WA.opportunity.list() || []).slice(0, 3);
      if (!rows.length) return DIM0 + '机会动向：暂无可选动向（世界在等你的下一步）</div>';
      let out = '<div>机会动向：在途 <b>' + esc(rows.length) + '</b> 条</div>';
      rows.forEach(function (v) {
        const ttl = v.title || v.text || v.name || v.summary || v.id || '';
        if (!ttl) return;
        out += sub(ttl + (v.stage ? '（' + v.stage + '）' : ''));
      });
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
    const body = foreshadowSect() + threadsSect() + stageSect() + opportunitySect() + longlineSect() + budgetSect();
    if (!body) return '';
    return '<div class="wa-sec">世界脉搏<span class="wa-dim">（世界这轮动了什么，一眼读完）</span></div>'
      + '<div style="margin:4px 0 8px;">' + body + '</div>';
  }

  const API = {
    worldPulseBlock: worldPulseBlock,
    bind: bind,
    ver: '2.413.0'
  };
  WA.panelWorldPulse = API;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/overview-world-pulse.js', { kind: 'ui', ver: '2.413.0' });
  }
})();