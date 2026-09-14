/**
 * WorldAxis ui/panel.js — 主面板 + 悬浮球
 * 设计：冷峻控制台风格（深色玻璃拟态 + 单色强调），分「概览/世界/人物/事件/导演/连接/日志」七页
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainDoc = WA.mainDoc || document;
  const mainWin = WA.mainWin || window;

  const PAGES = [
    { id: 'overview', icon: '◈', label: '概览' },
    { id: 'world', icon: '🌐', label: '世界' },
    { id: 'people', icon: '👤', label: '人物' },
    { id: 'events', icon: '⚡', label: '事件' },
    { id: 'director', icon: '🎬', label: '导演' },
    { id: 'connect', icon: '🔌', label: '连接' },
    { id: 'logs', icon: '📋', label: '日志' }
  ];

  let currentPage = 'overview';
  let panelEl = null, orbEl = null;

  function h(html) { const d = mainDoc.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '"' }[c])); }

  // ── 页面渲染 ──
  function renderOverview() {
    const s = WA.store.get();
    const nodes = WA.workflow.list();
    const beforeN = nodes.filter(n => n.chain === 'before').length, afterN = nodes.filter(n => n.chain === 'after').length;
    return `
      <div class="wa-stat-grid">
        <div class="wa-stat"><div class="wa-stat-v">${esc(s.clock.label || '未设定')}</div><div class="wa-stat-k">世界时间</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${Object.keys(s.people).length}</div><div class="wa-stat-k">追踪人物</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${s.currents.length}</div><div class="wa-stat-k">活跃暗流</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${s.memory.facts.filter(f=>f.active).length}</div><div class="wa-stat-k">长期事实</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${s.evolution.round}</div><div class="wa-stat-k">演化回合</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${beforeN}+${afterN}</div><div class="wa-stat-k">工作流节点</div></div>
      </div>
      <div class="wa-sec">工作流节点开关</div>
      <div class="wa-node-list">${nodes.map(n => `
        <label class="wa-node">
          <input type="checkbox" data-node="${esc(n.id)}" ${n.enabled ? 'checked' : ''}/>
          <span class="wa-node-chain ${n.chain}">${n.chain === 'before' ? '前' : '后'}</span>
          <span class="wa-node-label">${esc(n.label || n.id)}</span>
        </label>`).join('')}
      </div>`;
  }

  function renderWorld() {
    const s = WA.store.get();
    return `
      <div class="wa-sec">世界钟 <button class="wa-btn wa-mini" id="wa-set-clock">设定</button></div>
      <div class="wa-kv"><span>当前</span><b>${esc(s.clock.label || '未设定')}</b></div>
      <div class="wa-sec">世界背景设定</div>
      <textarea id="wa-bg" class="wa-ta" placeholder="填写世界背景/基调/规则（纯框架，不预设内容）…">${esc(s.background.text)}</textarea>
      <button class="wa-btn" id="wa-save-bg">保存背景</button>
      <div class="wa-sec">权威世界事实（${s.worldFacts.length}）</div>
      <div class="wa-list">${s.worldFacts.slice(-15).reverse().map(f => `<div class="wa-item"><b>${esc(f.key)}</b> = ${esc(f.value)}</div>`).join('') || '<div class="wa-empty">尚无已结算事实</div>'}</div>
      <div class="wa-sec">暗流（${s.currents.length}）</div>
      <div class="wa-list">${s.currents.slice(-10).reverse().map(c => `<div class="wa-item"><span class="wa-badge wa-vis-${c.visibility}">${c.visibility}</span> <b>${esc(c.title)}</b> <span class="wa-dim">${esc(c.stage)}</span><div class="wa-dim">${esc(c.summary || '').slice(0, 120)}</div></div>`).join('') || '<div class="wa-empty">暂无暗流</div>'}</div>
      <div class="wa-sec">纪事（${s.chronicle.length}）</div>
      <div class="wa-list">${s.chronicle.slice(-10).reverse().map(c => `<div class="wa-item wa-dim">${esc(c.title)} — ${esc((c.summary || '').slice(0, 80))}</div>`).join('') || '<div class="wa-empty">暂无纪事</div>'}</div>`;
  }

  function renderPeople() {
    const s = WA.store.get();
    const reg = WA.registry.list();
    const people = Object.values(s.people);
    return `
      <div class="wa-sec">NPC注册（发送前独白推演的候选集）</div>
      <div class="wa-row"><input id="wa-npc-name" class="wa-input" placeholder="角色全名…"/><button class="wa-btn" id="wa-npc-add">注册</button></div>
      <div class="wa-tag-row">${reg.map(n => `<span class="wa-tag">${esc(n)}<i data-unreg="${esc(n)}">✕</i></span>`).join('') || '<span class="wa-dim">尚未注册NPC</span>'}</div>
      <div class="wa-sec">世界人物状态（${people.length}）</div>
      <div class="wa-list">${people.map(p => `
        <div class="wa-item"><b>${esc(p.name)}</b> <span class="wa-dim">@ ${esc(p.location || '?')}</span>
          <div class="wa-dim">${esc(p.action || '')}${p.intent ? ' · 意图:' + esc(p.intent) : ''}</div>
          <button class="wa-btn wa-mini" data-observe="${esc(p.name)}">观测切片</button>
        </div>`).join('') || '<div class="wa-empty">世界推演后自动出现</div>'}</div>
      <div id="wa-observe-out" class="wa-out"></div>`;
  }

  function renderEvents() {
    const s = WA.store.get();
    const active = (s.directEvents || []).find(e => e.status === 'active');
    return `
      <div class="wa-sec">突发事件（一轮生成·多轮解封）</div>
      ${active ? `<div class="wa-item"><b>${esc(active.title)}</b> <span class="wa-badge">第${active.currentTurn}/${active.totalTurns}轮</span><div class="wa-dim">对手：${esc(active.opponent || '未通报')}</div><button class="wa-btn wa-mini" id="wa-de-abort">中止事件</button></div>`
        : `<div class="wa-row"><input id="wa-de-prompt" class="wa-input" placeholder="事件要求（可空）…"/><input id="wa-de-turns" class="wa-input wa-w60" type="number" value="6" min="1" max="30"/><button class="wa-btn" id="wa-de-create">生成事件</button></div>`}
      <div class="wa-sec">演化事件（${s.evolution.events.length}）</div>
      <div class="wa-list">${s.evolution.events.slice(-10).reverse().map(e => `<div class="wa-item"><span class="wa-badge">${esc(e.type === 'conflict' ? '冲突' : '进度')}</span> <b>${esc(e.title)}</b> <span class="wa-dim">${esc(e.stage)}</span></div>`).join('') || '<div class="wa-empty">暂无</div>'}</div>
      <div class="wa-sec">章节</div>
      ${s.chapters.current ? `<div class="wa-item"><b>${esc(s.chapters.current.title)}</b><div class="wa-dim">${esc((s.chapters.current.script || '').slice(0, 150))}</div><button class="wa-btn wa-mini" id="wa-ch-end">结束本章</button></div>`
        : `<div class="wa-row"><input id="wa-ch-title" class="wa-input" placeholder="章节标题…"/><button class="wa-btn" id="wa-ch-start">开始章节</button></div>`}`;
  }

  function renderDirector() {
    const vis = WA.render.getVisibility();
    const plan = WA.oracle.plan;
    return `
      <div class="wa-sec">注入可见性（哪些世界信息递给正文）</div>
      ${WA.render.SOURCES.map(k => `<label class="wa-node"><input type="checkbox" data-vis="${k}" ${vis[k] ? 'checked' : ''}/><span class="wa-node-label">${({clock:'世界时间',background:'世界背景',people:'人物',currents:'暗流',echoes:'回声',memory:'记忆',opinion:'舆情'})[k] || k}</span></label>`).join('')}
      <div class="wa-sec">剧情引导（弧线/序列）</div>
      ${plan ? `<div class="wa-item"><b>${esc(plan.kind === 'arc' ? '弧线' : '序列')}</b> 第${plan.current + 1}/${plan.beats.length}拍<div class="wa-dim">${esc((WA.oracle.currentBeat() || {}).goal || '')}</div><button class="wa-btn wa-mini" id="wa-beat-next">完成本拍</button><button class="wa-btn wa-mini" id="wa-plan-clear">放弃</button></div>`
        : `<textarea id="wa-plan-beats" class="wa-ta" placeholder="每行一拍的目标/指令…"></textarea><button class="wa-btn" id="wa-plan-start">开始序列引导</button>`}
      <div class="wa-sec">行动选项</div>
      <button class="wa-btn" id="wa-gen-choices">生成4个行动选项</button>
      <div id="wa-choices-out" class="wa-out"></div>`;
  }

  function renderConnect() {
    const chs = WA.apiRouter.listChannels();
    return `
      <div class="wa-sec">API通道（未配置的通道回落default）</div>
      ${chs.map(c => `
        <div class="wa-chan" data-chan="${c.name}">
          <div class="wa-chan-head"><b>${c.name}</b> ${c.cfg ? '<span class="wa-badge wa-on">已配置</span>' : '<span class="wa-badge">默认</span>'}</div>
          <input class="wa-input wa-ch-base" placeholder="Base URL（如 https://api.openai.com/v1）" value="${esc((c.cfg || {}).baseUrl || '')}"/>
          <input class="wa-input wa-ch-key" type="password" placeholder="API Key" value="${esc((c.cfg || {}).apiKey || '')}"/>
          <input class="wa-input wa-ch-model" placeholder="模型名" value="${esc((c.cfg || {}).model || '')}"/>
          <button class="wa-btn wa-mini wa-ch-save">保存</button>
        </div>`).join('')}
      <div class="wa-sec">并发上限：<b id="wa-conc-v">${WA.apiRouter.getConcurrency()}</b>（队列 ${WA.apiRouter.queueLength()}）</div>
      <input type="range" min="1" max="10" value="${WA.apiRouter.getConcurrency()}" id="wa-conc" class="wa-range"/>`;
  }

  function renderLogs() {
    return `<div class="wa-sec">运行日志（最近${WA.eventLog.length}条）</div>
      <button class="wa-btn wa-mini" id="wa-log-copy">复制</button>
      <div class="wa-logbox">${WA.eventLog.slice(-80).reverse().map(l => `<div class="wa-log wa-log-${l.level}"><span class="wa-dim">${new Date(l.t).toLocaleTimeString()}</span> ${esc(l.msg)}</div>`).join('')}</div>`;
  }

  const RENDERERS = { overview: renderOverview, world: renderWorld, people: renderPeople, events: renderEvents, director: renderDirector, connect: renderConnect, logs: renderLogs };

  function renderBody() {
    const body = panelEl.querySelector('.wa-body');
    body.innerHTML = RENDERERS[currentPage]();
    bindBody();
  }

  function bindBody() {
    const $ = sel => panelEl.querySelector(sel);
    panelEl.querySelectorAll('[data-node]').forEach(cb => cb.onchange = () => WA.workflow.setEnabled(cb.dataset.node, cb.checked));
    panelEl.querySelectorAll('[data-vis]').forEach(cb => cb.onchange = () => { WA.render.setVisibility(cb.dataset.vis, cb.checked); });
    panelEl.querySelectorAll('[data-unreg]').forEach(x => x.onclick = () => { WA.registry.unregister(x.dataset.unreg); renderBody(); });
    panelEl.querySelectorAll('[data-observe]').forEach(b => b.onclick = async () => { const out = $('#wa-observe-out'); out.textContent = '观测中…'; const r = await WA.observe.slice(b.dataset.observe); out.textContent = r.ok ? r.text : ('失败：' + (r.error && r.error.message || r.reason)); });
    const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
    on('#wa-save-bg', () => { WA.store.patch('background', { text: $('#wa-bg').value, updatedAt: Date.now() }); WA.log('info', '世界背景已保存'); });
    on('#wa-set-clock', () => { const v = prompt('设定世界时间（如「三日目·黄昏」）：', WA.store.read('clock.label', '')); if (v != null) { WA.calendar.setClock(v); renderBody(); } });
    on('#wa-npc-add', () => { const v = $('#wa-npc-name').value.trim(); if (v) { WA.registry.register(v); renderBody(); } });
    on('#wa-de-create', async () => { const p = $('#wa-de-prompt').value.trim(); const t = +$('#wa-de-turns').value || 6; const btn = $('#wa-de-create'); btn.textContent = '生成中…'; await WA.directEvent.create({ prompt: p, turns: t }); renderBody(); });
    on('#wa-de-abort', () => { WA.directEvent.abort(); renderBody(); });
    on('#wa-ch-start', () => { WA.chapters.start($('#wa-ch-title').value.trim()); renderBody(); });
    on('#wa-ch-end', () => { WA.chapters.end(); renderBody(); });
    on('#wa-plan-start', () => { const lines = $('#wa-plan-beats').value.split('\n').map(s => s.trim()).filter(Boolean).map(g => ({ goal: g })); if (lines.length) { WA.oracle.setPlan({ kind: 'sequence', beats: lines, current: 0 }); renderBody(); } });
    on('#wa-beat-next', () => { if (WA.oracle.plan) { WA.oracle.plan.current++; if (WA.oracle.plan.current >= WA.oracle.plan.beats.length) WA.oracle.clear(); renderBody(); } });
    on('#wa-plan-clear', () => { WA.oracle.clear(); renderBody(); });
    on('#wa-gen-choices', async () => { const out = $('#wa-choices-out'); out.textContent = '生成中…'; const cs = await WA.choices.generate(4); out.innerHTML = cs.length ? cs.map((c, i) => `<div class="wa-item">${i + 1}. ${esc(c)}</div>`).join('') : '（未配置choices通道或生成失败）'; });
    on('#wa-log-copy', () => { navigator.clipboard && navigator.clipboard.writeText(WA.eventLog.map(l => `[${new Date(l.t).toLocaleTimeString()}][${l.level}] ${l.msg} ${l.data || ''}`).join('\n')); });
    const conc = $('#wa-conc'); if (conc) conc.oninput = () => { WA.apiRouter.setConcurrency(+conc.value); $('#wa-conc-v').textContent = conc.value; };
    panelEl.querySelectorAll('.wa-chan').forEach(box => {
      box.querySelector('.wa-ch-save').onclick = () => {
        WA.apiRouter.setChannel(box.dataset.chan, { baseUrl: box.querySelector('.wa-ch-base').value.trim(), apiKey: box.querySelector('.wa-ch-key').value.trim(), model: box.querySelector('.wa-ch-model').value.trim() });
        renderBody();
      };
    });
  }

  // ── 面板与悬浮球 ──
  function buildPanel() {
    panelEl = h(`<div id="wa-panel" class="wa-hidden">
      <div class="wa-head"><span class="wa-title">◈ 世界枢轴 <span class="wa-ver">v${WA.version}</span></span><span class="wa-close">✕</span></div>
      <div class="wa-tabs">${PAGES.map(p => `<button class="wa-tab" data-page="${p.id}">${p.icon} ${p.label}</button>`).join('')}</div>
      <div class="wa-body"></div>
    </div>`);
    mainDoc.body.appendChild(panelEl);
    panelEl.querySelector('.wa-close').onclick = () => toggle(false);
    panelEl.querySelectorAll('.wa-tab').forEach(t => t.onclick = () => { currentPage = t.dataset.page; syncTabs(); renderBody(); });
    syncTabs();
  }
  function syncTabs() { panelEl.querySelectorAll('.wa-tab').forEach(t => t.classList.toggle('active', t.dataset.page === currentPage)); }

  function buildOrb() {
    orbEl = h(`<div id="wa-orb" title="世界枢轴">◈</div>`);
    mainDoc.body.appendChild(orbEl);
    let drag = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
    orbEl.addEventListener('pointerdown', e => { drag = true; moved = false; sx = e.clientX; sy = e.clientY; const r = orbEl.getBoundingClientRect(); ox = r.left; oy = r.top; orbEl.setPointerCapture(e.pointerId); });
    orbEl.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 6) moved = true; orbEl.style.left = (ox + dx) + 'px'; orbEl.style.top = (oy + dy) + 'px'; orbEl.style.right = 'auto'; orbEl.style.bottom = 'auto'; });
    orbEl.addEventListener('pointerup', () => { drag = false; if (!moved) toggle(); });
  }

  function toggle(force) {
    const show = force !== undefined ? force : panelEl.classList.contains('wa-hidden');
    panelEl.classList.toggle('wa-hidden', !show);
    if (show) renderBody();
  }

  WA.ui = {
    mount() {
      if (mainDoc.getElementById('wa-panel')) return;
      buildPanel(); buildOrb();
      // 世界推演状态事件 → 悬浮球呼吸
      WA.on('backstage:started', () => orbEl && orbEl.classList.add('wa-busy'));
      WA.on('backstage:settled', () => orbEl && orbEl.classList.remove('wa-busy'));
      WA.log('info', 'UI已挂载（悬浮球+主面板）');
    },
    open() { toggle(true); }
  };
})();
