/**
 * WorldAxis engines/world-reader.js (v2.405.0) — 世界读数通道
 *
 * 【RUBY 通道机制的 WorldAxis 版】
 *   RUBY 分析器插件的精髓不是面板排版，而是机制：read 出一份结构化数据，
 *   前端爱怎么渲染怎么渲染——接口不预设格式。本模块补这条通道：
 *     snapshot()   结构化读口：纯 JSON，零 HTML，零诊断术语。
 *     renderCard() 玩家语言卡片：出 HTML 片段，面板只做转义与排版。
 *   ruby 卡生态未来可直接读 snapshot 渲染状态卡。
 *
 * 【纪律】零 store 写 / 零 settingsBus 写 / 零 localStorage / 零模型调用。
 *   信息边界：暗流只出 visibility ∈ {known, direct}，trace/hidden 不出。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  if (WA.worldReader) return; // 幂等装载

  const STAGE_TEXT = {
    '起线': '刚露头', '延展': '在推进', '成形': '快收口', '收束': '在收尾', '淡出': '淡出中'
  };
  const VIS_TEXT = { 'known': '你已知情', 'direct': '你亲历其中' };
  const CHOICE_ST_TEXT = { 'chosen': '你已选择', 'open': '等你决定' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '"').replace(/'/g, '&#39;');
  }
  function txt(v, cap) {
    const t = String(v == null ? '' : v).trim();
    return cap ? t.slice(0, cap) : t;
  }

  // ── snapshot：结构化读口（纯只读现算，接口不预设格式） ──
  // opt.peopleCap / currentCap / factCap / choiceCap 各面上限，默认与推演快照同档。
  function snapshot(opt) {
    const o = (opt && typeof opt === 'object') ? opt : {};
    let s = null;
    try { s = WA.store.get(); } catch (e) { s = null; }
    if (!s) return { ok: false, reason: 'store-absent', people: [], currents: [], facts: [], choices: [], foreshadows: [], evolution: null, counts: {} };

    // 人物面：updatedAt 降序（与 compactState 同口径），loc/act/intent 出；
    // 内心面（innerVoice 等）不出——防全知，玩家面只给公开动线。
    const people = Object.values(s.people || {})
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
      .slice(0, Math.max(1, Math.min(50, o.peopleCap || 8)))
      .map(function (p) {
        return {
          id: p.id, name: txt(p.name) || txt(p.id),
          loc: txt(p.location, 40), act: txt(p.action, 60), intent: txt(p.intent, 60)
        };
      });

    // 暗流面：信息边界——只出 known/direct（你已知情 / 你亲历）。
    const currents = (s.currents || [])
      .filter(function (c) {
        return c && !['已结束', 'closed'].includes(c.stage)
          && (c.visibility === 'known' || c.visibility === 'direct');
      })
      .slice(0, Math.max(1, Math.min(20, o.currentCap || 10)))
      .map(function (c) {
        return {
          title: txt(c.title, 40), stage: txt(c.stage),
          stageText: STAGE_TEXT[c.stage] || txt(c.stage),
          visText: VIS_TEXT[c.visibility] || txt(c.visibility),
          summary: txt(c.summary, 120)
        };
      });

    // 长期事实面：active 事实（与概览页统计卡 f.active 同口径），key 去重取最新。
    const allFacts = (s.worldFacts || []).filter(function (f) { return f && f.active !== false; });
    const factSeen = {}; const facts = [];
    for (let i = allFacts.length - 1; i >= 0 && facts.length < Math.max(1, Math.min(30, o.factCap || 10)); i--) {
      const f = allFacts[i];
      if (!factSeen[f.key]) { factSeen[f.key] = 1; facts.push({ key: txt(f.key, 40), value: txt(f.value, 120) }); }
    }

    // 选择面：两源合并（storyChoice.points + branchTree.nodes），
    // 与 backstage.compactState.choices_recent 同口径；round 降序，同 id 同源去重。
    const scPts = (s.storyChoice && Array.isArray(s.storyChoice.points)) ? s.storyChoice.points : [];
    const btNodes = (s.branchTree && Array.isArray(s.branchTree.nodes)) ? s.branchTree.nodes : [];
    const cRows = [];
    scPts.forEach(function (p) {
      if (!p) return;
      cRows.push({
        q: txt(p.prompt, 60),
        st: p.chosenAt > 0 ? 'chosen' : 'open',
        stText: CHOICE_ST_TEXT[p.chosenAt > 0 ? 'chosen' : 'open'],
        pick: txt(p.choice, 30),
        applied: p.appliedAt > 0,
        round: p.round || 0,
        src: 'sc'
      });
    });
    btNodes.forEach(function (n) {
      if (!n) return;
      cRows.push({
        q: txt(n.prompt, 60),
        st: n.chosenAt > 0 ? 'chosen' : 'open',
        stText: CHOICE_ST_TEXT[n.chosenAt > 0 ? 'chosen' : 'open'],
        pick: txt(n.choice, 30),
        applied: false,
        round: n.round || 0,
        src: 'bt'
      });
    });
    const cSeen = {}; const choices = [];
    cRows.sort(function (a, b) { return (b.round || 0) - (a.round || 0); })
      .forEach(function (r) {
        if (!cSeen[r.q + ':' + r.src]) { cSeen[r.q + ':' + r.src] = 1; choices.push(r); }
      });
    choices.length = Math.min(choices.length, Math.max(1, Math.min(12, o.choiceCap || 6)));

    // 伏笔面：waiting/developing（与 compactState.foreshadows 同口径）。
    const foreshadows = ((s.memory && s.memory.foreshadows) || [])
      .filter(function (f) { return f && (f.status === 'waiting' || f.status === 'developing'); })
      .slice(0, 8)
      .map(function (f) { return { content: txt(f.content, 60), status: f.status }; });

    // 演化面：activeSnapshot 直读（events/factions/winds/reputation/economy）。
    let evolution = null;
    try {
      if (WA.evolution && typeof WA.evolution.activeSnapshot === 'function') evolution = WA.evolution.activeSnapshot();
    } catch (e2) { evolution = null; }

    // 脉搏面：推演写回的世界压力（pressure 0-3 / trend / note）。
    const pulse = s.worldPulse || null;

    // counts 对账面：面板统计卡同源的六个计数，供 ruby 卡生态对账。
    const counts = {
      people: Object.keys(s.people || {}).length,
      currents: (s.currents || []).filter(function (c) { return c && !['已结束', 'closed'].includes(c.stage); }).length,
      currentsVisible: currents.length,
      facts: allFacts.length,
      choicesOpen: choices.filter(function (r) { return r.st === 'open'; }).length,
      round: (s.evolution && s.evolution.round) || 0
    };

    return {
      ok: true, ver: '2.406.0', at: Date.now(),
      clock: (s.clock && s.clock.label) ? txt(s.clock.label, 60) : '',
      people: people, currents: currents, facts: facts,
      choices: choices, foreshadows: foreshadows,
      evolution: evolution, pulse: pulse, counts: counts
    };
  }

  // ── renderCard：玩家语言卡片（HTML 片段，面板只做转义排版） ──
  // 四态：absent（store 缺席）/ quiet（世界还没动静）/ live（正常）/ error。
  function renderCard() {
    let snap = null;
    try { snap = snapshot(); } catch (e) {
      return '<div class="wa-dim" id="wa-world-pulse-card">世界脉搏读数异常：' + esc(e && e.message || e) + '</div>';
    }
    if (!snap || snap.ok !== true) {
      return '<div class="wa-dim" id="wa-world-pulse-card">世界还没立起来（先完成开局引导）</div>';
    }
    const line = function (cls, html) { return '<div class="' + cls + '">' + html + '</div>'; };
    const parts = [];
    // v2.406.0：卡片头——「世界脉搏」标题 + 脉搏徽章（收紧/松下来/维持现状/无读数）。
    //   措辞仍全部来自引擎（不造第二真源）；徽章只是把已有 trend 措辞放进稳定 class。
    //   头单独进 head 变量不算正文段——quiet 判定只看正文段（v2.406 修正：头入 parts
    //   曾让空世界永远渲染成只有头没有内容的伪 live）。
    let pulseBadge = '<span class="wa-world-badge wa-world-badge-steady">安静</span>';
    if (snap.pulse) {
      const trMap = { rising: '收紧', falling: '松下来', steady: '维持' };
      pulseBadge = '<span class="wa-world-badge wa-world-badge-' + esc(snap.pulse.trend || 'steady') + '">'
        + esc(trMap[snap.pulse.trend] || '维持') + '</span>';
    }
    const head = line('wa-world-head', '<b>世界脉搏</b>' + pulseBadge);

    // 段一：谁在哪、要做什么（人物公开动线）
    const ppl = snap.people.filter(function (p) { return p.loc || p.act || p.intent; });
    if (ppl.length) {
      parts.push(line('wa-sec wa-sec-ppl', '<b>谁在哪、要做什么</b>'));
      ppl.slice(0, 5).forEach(function (p) {
        const seg = [p.loc, p.act, p.intent].filter(Boolean).join('，');
        parts.push(line('wa-ppl-row', '<span class="wa-world-name">' + esc(p.name) + '</span>'
          + (seg ? '<span class="wa-world-sep"> — </span><span class="wa-world-val">' + esc(seg) + '</span>'
          : '<span class="wa-world-sep">（行踪未定）</span>')));
      });
    }

    // 段二：哪条线在动（可见暗流，玩家视角措辞）
    if (snap.currents.length) {
      parts.push(line('wa-sec wa-sec-cur', '<b>哪些事正在动</b>'));
      snap.currents.slice(0, 4).forEach(function (c) {
        parts.push(line('wa-cur-row',
          '<span class="wa-world-name">' + esc(c.title) + '</span>'
          + '<span class="wa-world-badge wa-world-badge-stage">' + esc(c.stageText) + '</span>'
          + '<span class="wa-world-badge wa-world-badge-vis">' + esc(c.visText) + '</span>'
          + (c.summary ? '<div class="wa-world-val">' + esc(c.summary) + '</div>' : '')));
      });
    }

    // 段三：你的抉择（两源选择，v2.404 回流数据首次亮给玩家面）
    if (snap.choices.length) {
      parts.push(line('wa-sec wa-sec-cho', '<b>你的抉择</b>'));
      snap.choices.slice(0, 4).forEach(function (c) {
        const badge = c.st === 'chosen'
          ? '<span class="wa-world-badge wa-world-badge-chosen">' + (c.applied ? '已兑现' : '结算中') + '</span>'
          : '<span class="wa-world-badge wa-world-badge-open">等你决定</span>';
        parts.push(line('wa-cho-row',
          '<span class="wa-world-name">' + esc(c.q) + '</span>' + badge
          + (c.st === 'chosen' && c.pick ? '<span class="wa-world-val">选了「' + esc(c.pick) + '」</span>' : '')));
      });
    }

    // 段四：埋着的线（伏笔）与脉搏——有才出，不占屏
    if (snap.foreshadows.length) {
      parts.push(line('wa-sec wa-sec-fs', '<b>埋着的线</b>'));
      snap.foreshadows.slice(0, 3).forEach(function (f) {
        parts.push(line('wa-fs-row', '<span class="wa-world-val">' + esc(f.content) + '</span>'));
      });
    }
    if (snap.pulse && (snap.pulse.note || snap.pulse.pressure > 0)) {
      const tr = { rising: '世界在收紧', falling: '世界在松下来', steady: '世界维持现状' };
      parts.push(line('wa-pulse-row', esc(tr[snap.pulse.trend] || '世界维持现状')
        + (snap.pulse.note ? '<span class="wa-world-sep">：</span><span class="wa-world-val">' + esc(String(snap.pulse.note)) + '</span>' : '')));
    }

    // quiet：四段全空 = 世界还没动静，一句话收住不占屏（头也要，但正文零段才 quiet）
    if (!parts.length) {
      return '<div class="wa-world-card wa-world-quiet" id="wa-world-pulse-card">' + head
        + '世界暂时风平浪静。</div>';
    }
    return '<div class="wa-world-card wa-world-live" id="wa-world-pulse-card">'
      + head + parts.join('') + '</div>';
  }

  /**
   * OPV23-7: 全息事件流瀑布与地缘热力拓扑
   */
  function streamCascadeEvents(limit) {
    const lim = Math.max(1, Math.min(20, Number(limit) || 8));
    const events = [];
    if (WA.worldSingularity) {
      const s = WA.worldSingularity.getSingularityState();
      events.push({ kind: 'epoch', text: '时代纪元: ' + s.epoch, tension: s.tension });
    }
    return { ok: true, count: events.length, events: events.slice(0, lim) };
  }

  function renderHolographicGeoMap() {
    return '<div class="wa-geo-cascade-hub"><div class="wa-sec">地缘态势全息热力流</div><div class="wa-geo-live">大陆各枢纽通路受地质与商路动态投影中</div></div>';
  }

  WA.worldReader = {
    snapshot: snapshot,
    renderCard: renderCard,
    streamCascadeEvents: streamCascadeEvents,
    renderHolographicGeoMap: renderHolographicGeoMap,
    ver: '2.408.0'
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/world-reader.js', { kind: 'engine', ver: '2.406.0' });
  }
  if (WA.log) WA.log('info', '世界读数通道已加载（只读聚合）');
})();
