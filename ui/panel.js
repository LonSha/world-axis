/**
 * WorldAxis ui/panel.js — 主面板 + 悬浮球
 * 设计：冷峻控制台风格（深色玻璃拟态 + 单色强调），分「概览/世界/人物/事件/导演/连接/日志」七页
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainDoc = WA.mainDoc || document;
  const mainWin = WA.mainWin || window;

  // v0.6 新增组件样式注入
  (function injectStyles() {
    const css = `
      .wa-digest { font-style: italic; opacity: .85; line-height: 1.6; padding: 8px 10px; border-left: 3px solid #7c6af7; margin: 4px 0; }
      .wa-rep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .wa-rep-cell { text-align: center; padding: 6px 4px; background: rgba(255,255,255,.04); border-radius: 4px; }
      .wa-enemy-blood { background: #c62828 !important; color: #fff !important; }
      .wa-enemy-grudge { background: #e65100 !important; color: #fff !important; }
    `;
    try {
      const el = mainDoc.createElement('style');
      el.textContent = css;
      (mainDoc.head || mainDoc.documentElement).appendChild(el);
    } catch (e) {}
  })();

  const PAGES = [
    { id: 'overview', icon: '◈', label: '概览' },
    { id: 'world', icon: '🌐', label: '世界' },
    { id: 'people', icon: '👤', label: '人物' },
    { id: 'events', icon: '⚡', label: '事件' },
    { id: 'director', icon: '🎬', label: '导演' },
    { id: 'settings', icon: '⚙️', label: '设置' },
    { id: 'connect', icon: '🔌', label: '连接' },
    { id: 'assistant', icon: '💬', label: '助手' },
    { id: 'tools', icon: '🧰', label: '工具' },
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
    const ev = s.evolution || {};
    const active = (s.directEvents || []).find(e => e.status === 'active');
    const esc = t => String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // 势力徽章色
    const factionBadge = st => ({'鼎盛':'🟡','强盛':'🟢','平稳':'⚪','衰退':'🟠','动荡':'🔴','瓦解':'⚫'}[st]||'⚪');
    const relBadge = r => ({'血盟':'💞','盟友':'🤝','友好':'😊','中立':'😐','冷淡':'😒','敌对':'⚔️','世仇':'💀'}[r]||'😐');
    const repColor = l => ({'万众敬仰':'#4caf50','受人敬重':'#8bc34a','小有名气':'#ffc107','默默无闻':'#9e9e9e','声名狼藉':'#ff5722','天怒人怨':'#f44336'}[l]||'#9e9e9e');
    const ecoColor = c => ({'繁荣':'#4caf50','平稳':'#2196f3','萧条':'#ff9800','危机':'#f44336'}[c]||'#2196f3');

    const factions = ev.factions || [];
    const rep = ev.reputation || {};
    const eco = ev.economy || {};
    const enemies = (ev.enemies || []).filter(e => e.status !== '已终结');
    const trends = (ev.worldTrends || []).filter(t => t.status === '持续中');
    const winds = (ev.winds || []).filter(w => !w.quiet);
    const hz = (ev.horizon) || {};
    const digest = ev.worldDigest;

    return `
      <div class="wa-sec">突发事件（一轮生成·多轮解封）</div>
      ${active ? `<div class="wa-item"><b>${esc(active.title)}</b> <span class="wa-badge">第${active.currentTurn}/${active.totalTurns}轮</span><div class="wa-dim">对手：${esc(active.opponent || '未通报')}</div><button class="wa-btn wa-mini" id="wa-de-abort">中止事件</button></div>`
        : `<div class="wa-row"><input id="wa-de-prompt" class="wa-input" placeholder="事件要求（可空）…"/><input id="wa-de-turns" class="wa-input wa-w60" type="number" value="6" min="1" max="30"/><button class="wa-btn" id="wa-de-create">生成事件</button></div>`}

      ${digest && digest.text ? `<div class="wa-sec">世界推演叙事</div><div class="wa-item wa-digest">${esc(digest.text)}</div>` : ''}

      <div class="wa-sec">势力（${factions.length}）</div>
      <div class="wa-list">${factions.slice(0,6).map(f => `<div class="wa-item">${factionBadge(f.status)} <b>${esc(f.name)}</b> <span class="wa-badge">${esc(f.status)}</span> <span class="wa-dim">${relBadge(f.relation)}${esc(f.relation)}</span>${f.currentGoal ? `<div class="wa-dim">目标：${esc(f.currentGoal)}</div>` : ''}</div>`).join('') || '<div class="wa-empty">暂无势力</div>'}</div>

      <div class="wa-sec">声誉四维</div>
      <div class="wa-item wa-rep-grid">${['authority','common','shadow','circuit'].map(dim => {
        const labels = {authority:'朝堂',common:'民间',shadow:'江湖',circuit:'商界'};
        const lv = rep[dim] || '默默无闻';
        return `<div class="wa-rep-cell"><div class="wa-dim">${labels[dim]}</div><div style="color:${repColor(lv)}">${esc(lv)}</div></div>`;
      }).join('')}</div>

      <div class="wa-sec">经济气候</div>
      <div class="wa-item"><span style="color:${ecoColor(eco.climate)}">●</span> <b>${esc(eco.climate || '平稳')}</b>${(eco.signals||[]).length ? `<div class="wa-dim">${eco.signals.slice(0,3).map(sg=>esc(sg)).join(' · ')}</div>` : ''}</div>

      ${enemies.length ? `<div class="wa-sec">仇敌录（${enemies.length}）</div>
      <div class="wa-list">${enemies.slice(0,4).map(e => `<div class="wa-item"><span class="wa-badge wa-enemy-${e.type}">${e.type==='blood'?'血仇':'怨结'}</span> <b>${esc(e.name)}</b> <span class="wa-dim">${esc(e.status)}</span><div class="wa-dim">${esc(e.reason||'')}</div></div>`).join('')}</div>` : ''}

      ${trends.length ? `<div class="wa-sec">天下大势（${trends.length}）</div>
      <div class="wa-list">${trends.slice(0,3).map(t => `<div class="wa-item"><b>${esc(t.name)}</b> <span class="wa-badge">${esc(t.scope)}</span><div class="wa-dim">${esc((t.description||'').slice(0,80))}</div></div>`).join('')}</div>` : ''}

      ${winds.length ? `<div class="wa-sec">风声（${winds.length}）</div>
      <div class="wa-list">${winds.slice(0,4).map(w => `<div class="wa-item">${'🌀'.repeat(Math.min(w.level||1,3))} <b>${esc(w.topic)}</b> <span class="wa-dim">Lv${w.level||1}</span><div class="wa-dim">${esc((w.content||'').slice(0,60))}</div></div>`).join('')}</div>` : ''}

      <div class="wa-sec">远方/近端事件泳道</div>
      <div class="wa-item wa-dim">${hz.distant ? `远方 ledger=${hz.distant.ledger} cd=${hz.distant.cooldown}${hz.distant.pending?' ⏳':''}` : '远方 —'}<br>${hz.near ? `近端 ledger=${hz.near.ledger} cd=${hz.near.cooldown}${hz.near.pending?' ⏳':''}` : '近端 —'}</div>

<div class="wa-sec">演化事件（${(ev.events||[]).length}）</div>
      <div class="wa-list">${(ev.events||[]).slice(-10).reverse().map(e => `<div class="wa-item"><span class="wa-badge">${esc(e.type === 'conflict' ? '冲突' : '进度')}</span> <b>${esc(e.name || e.title || '')}</b> <span class="wa-dim">${esc(e.stage)}${e.stall?' ':''}</span></div>`).join('') || '<div class="wa-empty">暂无</div>'}</div>

      <div class="wa-sec">势力编辑器（结构化手动增删改）</div>
      ${WA.editorFaction ? `
        <div class="wa-row"><input id="wa-ef-name" class="wa-input" placeholder="名称"/><input id="wa-ef-scope" class="wa-input wa-w60" placeholder="范围"/></div>
        <div class="wa-row"><input id="wa-ef-goal" class="wa-input" placeholder="当前目标"/><input id="wa-ef-core" class="wa-input wa-w60" placeholder="核心人物"/></div>
        <div class="wa-row"><input id="wa-ef-pillars" class="wa-input" placeholder="权力支柱（逗号分隔，≤4字）"/><button class="wa-btn" id="wa-ef-add">新增势力</button></div>
        <div class="wa-list">${(WA.editorFaction.list(s) || []).map((f, i) => `<div class="wa-item"><b>${esc(f.name)}</b> <span class="wa-badge">${esc(f.status)}</span> <span class="wa-dim">${esc(f.relation)} · ${esc(f.scope||'—')}</span>
          <div class="wa-dim">支柱：${esc((f.powerPillars||[]).join('、')||'—')}</div>
          <button class="wa-btn wa-mini" data-ef-edit="${i}">改状态</button><button class="wa-btn wa-mini" data-ef-copy="${i}">复制</button><button class="wa-btn wa-mini" data-ef-del="${i}">删除</button></div>`).join('') || '<div class="wa-empty">暂无势力</div>'}</div>
        <div class="wa-dim">声誉总压：${WA.editorFaction.reputationPressure(s).pressure} / ±${WA.editorFaction.reputationPressure(s).cap}</div>` : '<div class="wa-empty">势力编辑器未加载</div>'}
      <div class="wa-sec">事件编辑器</div>
      ${WA.editorEvents ? `
        <div class="wa-row"><input id="wa-ee-name" class="wa-input" placeholder="事件名"/><select id="wa-ee-type" class="wa-input wa-w60"><option value="conflict">冲突型</option><option value="progress">推进型</option></select><button class="wa-btn" id="wa-ee-add">新增事件</button></div>
        <div class="wa-list">${(WA.editorEvents.list(s) || []).map((e, i) => `<div class="wa-item"><b>${esc(e.name)}</b> <span class="wa-badge">${e.type === 'conflict' ? '冲突' : '进度'} Lv.${e.level}</span> <span class="wa-dim">${esc(e.stage)} ${e.stageRound||1}/9</span>
          <button class="wa-btn wa-mini" data-ee-prev="${i}">阶段</button><button class="wa-btn wa-mini" data-ee-next="${i}">阶段▶</button><button class="wa-btn wa-mini" data-ee-del="${i}">删除</button></div>`).join('') || '<div class="wa-empty">暂无事件</div>'}</div>` : '<div class="wa-empty">事件编辑器未加载</div>'}
      <div class="wa-sec">状态一致性体检</div>
      <button class="wa-btn" id="wa-inspect-run">立即体检（纯只读）</button>
      <div id="wa-inspect-out" class="wa-out"></div>

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

  function renderTools() {
    return `
      <div class="wa-sec">世界态势分析（纯只读体检）</div>
      <button class="wa-btn" id="wa-an-run">立即分析</button>
      <div id="wa-an-out" class="wa-out"></div>
      <div class="wa-sec">状态快照导出 / 恢复</div>
      <div class="wa-row"><button class="wa-btn" id="wa-snap-dl">导出 JSON</button><button class="wa-btn" id="wa-snap-up">导入 JSON</button><input type="file" id="wa-snap-file" accept=".json" style="display:none"/></div>
      <div class="wa-dim">导出剔除运行时脏字段；导入先校验（格式/schema/字段完整性），通过才写入并自动留恢复点。</div>
      <div id="wa-snap-out" class="wa-out"></div>
      <div class="wa-sec">外部数据导入（自动识别类型）</div>
      <div class="wa-row"><button class="wa-btn" id="wa-imp-pick">选择 JSON 文件</button><input type="file" id="wa-imp-file" accept=".json" style="display:none"/></div>
      <div class="wa-dim">支持：全量存档 / 区域事件 / 势力清单 / 事件链清单 / 人物主观记忆 / 世界书条目组（自动判别）</div>
      <textarea id="wa-imp-text" class="wa-ta" placeholder="或直接粘贴 JSON 内容…"></textarea>
      <button class="wa-btn" id="wa-imp-run">预检并导入</button>
      <div id="wa-imp-out" class="wa-out"></div>
      <div class="wa-sec">扩展自检（模块/注入/UI/运行环境）</div>
      <div class="wa-row"><button class="wa-btn" id="wa-diag-run">立即自检</button><button class="wa-btn" id="wa-diag-dl">导出诊断包</button><button class="wa-btn" id="wa-audit-copy">复制内存审计</button><button class="wa-btn" id="wa-key-check">存储键体检</button><button class="wa-btn" id="wa-quar-view">隔离现场</button><button class="wa-btn" id="wa-recovery-dl">导出恢复点</button><button class="wa-btn" id="wa-maintain">健康巡视</button><button class="wa-btn" id="wa-conf-view">冲突现场</button></div>
      <div class="wa-dim">只读体检：模块装载完整性、上轮注入是否真进 prompt、面板控件绑定、视图开关、工作流与API通道。不含聊天正文与密钥。</div>
      <div id="wa-diag-out" class="wa-out"></div>`;
  }

  let __logErrOnly = false;
  function renderLogs() {
    const errCount = (WA.errorLog || []).length;
    const src = __logErrOnly && WA.errorLog ? WA.errorLog : WA.eventLog;
    const label = __logErrOnly ? `错误日志（最近${errCount}条，子环保留≤50）` : `运行日志（最近${WA.eventLog.length}条）`;
    return `<div class="wa-sec">${label}</div>
      <button class="wa-btn wa-mini" id="wa-log-err">${__logErrOnly ? '显示全部' : `仅看错误${errCount ? '(' + errCount + ')' : ''}`}</button>
      <button class="wa-btn wa-mini" id="wa-log-copy">复制</button>
      <button class="wa-btn wa-mini" id="wa-err-report">复制错误报告</button>
      <div class="wa-logbox">${src.slice(-80).reverse().map(l => `<div class="wa-log wa-log-${l.level}"><span class="wa-dim">${new Date(l.t).toLocaleTimeString()}</span> ${esc(l.msg)}</div>`).join('')}</div>`;
  }

  const RENDERERS = { overview: renderOverview, world: renderWorld, people: renderPeople, events: renderEvents, director: renderDirector, connect: renderConnect, tools: renderTools, logs: renderLogs,
    settings: () => WA.uiSettings ? WA.uiSettings.render() : '<div class="wa-empty">设置模块未加载</div>',
    assistant: renderAssistant };

  function renderAssistant() {
    return `
      <div class="wa-sec">世界助手（就世界状态问答，上帝视角）</div>
      <div class="wa-row"><input id="wa-ask-input" class="wa-input" placeholder="问世界/人物/暗流/舆情…"/><button class="wa-btn" id="wa-ask-btn">问</button></div>
      <div id="wa-ask-out" class="wa-out"></div>
      <div class="wa-sec">番外小剧场</div>
      <div class="wa-row"><input id="wa-theater-input" class="wa-input" placeholder="剧场指令（可空）…"/><button class="wa-btn" id="wa-theater-btn">生成番外</button></div>
      <div id="wa-theater-out" class="wa-out"></div>`;
  }

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
    // 势力/事件编辑器绑定（v0.9.0）
    if (currentPage === 'events') {
      const efAdd = $('#wa-ef-add');
      if (efAdd && WA.editorFaction) efAdd.onclick = () => {
        const pillars = ($('#wa-ef-pillars').value || '').split(/[,，]/).map(x => x.trim()).filter(Boolean);
        const r = WA.store.transact(d => WA.editorFaction.add(d, {
          name: $('#wa-ef-name').value, scope: $('#wa-ef-scope').value,
          currentGoal: $('#wa-ef-goal').value, core_person: $('#wa-ef-core').value,
          powerPillars: pillars
        })).result;
        if (!r.ok) WA.log('warn', '势力新增失败：' + r.reason);
        renderBody();
      };
      panelEl.querySelectorAll('[data-ef-del]').forEach(b => b.onclick = () => { WA.store.transact(d => WA.editorFaction.remove(d, +b.dataset.efDel)); renderBody(); });
      panelEl.querySelectorAll('[data-ef-copy]').forEach(b => b.onclick = () => { WA.store.transact(d => WA.editorFaction.copy(d, +b.dataset.efCopy)); renderBody(); });
      panelEl.querySelectorAll('[data-ef-edit]').forEach(b => b.onclick = () => {
        const arr = WA.editorFaction.list();
        const cur = arr[+b.dataset.efEdit];
        const next = prompt('运势（' + WA.editorFaction.STATUSES.join('/') + '）：', cur && cur.status);
        if (next != null) {
          const rel = prompt('关系（' + WA.editorFaction.RELATIONS.join('/') + '）：', cur && cur.relation);
          WA.store.transact(d => WA.editorFaction.update(d, +b.dataset.efEdit, { status: next, relation: rel == null ? undefined : rel }));
          renderBody();
        }
      });
      const eeAdd = $('#wa-ee-add');
      if (eeAdd && WA.editorEvents) eeAdd.onclick = () => {
        const r = WA.store.transact(d => WA.editorEvents.add(d, { name: $('#wa-ee-name').value, type: $('#wa-ee-type').value })).result;
        if (!r.ok) WA.log('warn', '事件新增失败：' + r.reason);
        renderBody();
      };
      panelEl.querySelectorAll('[data-ee-next]').forEach(b => b.onclick = () => { WA.store.transact(d => WA.editorEvents.shiftStage(d, +b.dataset.eeNext, 1)); renderBody(); });
      panelEl.querySelectorAll('[data-ee-prev]').forEach(b => b.onclick = () => { WA.store.transact(d => WA.editorEvents.shiftStage(d, +b.dataset.eePrev, -1)); renderBody(); });
      panelEl.querySelectorAll('[data-ee-del]').forEach(b => b.onclick = () => { WA.store.transact(d => WA.editorEvents.remove(d, +b.dataset.eeDel)); renderBody(); });
      const insRun = $('#wa-inspect-run');
      if (insRun && WA.inspectorState) insRun.onclick = () => {
        const rep = WA.inspectorState.inspect();
        const flat = WA.inspectorState.flatten(rep);
        const out = $('#wa-inspect-out');
        out.innerHTML = '<div class="wa-item"><b>' + esc(WA.inspectorState.summaryText(rep)) + '</b></div>' +
          (flat.length ? flat.slice(0, 20).map(it => '<div class="wa-dim">[' + it.level + '] ' + esc(it.detail) + '</div>').join('') : '');
      };
    }
    // 工具页绑定（v0.9.1）
    if (currentPage === 'tools') {
      const anRun = $('#wa-an-run');
      if (anRun && WA.toolAnalyzer) anRun.onclick = () => {
        const r = WA.toolAnalyzer.analyze();
        const p = r.pressure;
        $('#wa-an-out').innerHTML =
          '<div class="wa-item"><b>' + esc(WA.toolAnalyzer.summaryText(r)) + '</b></div>' +
          '<div class="wa-dim">事件' + p.event + ' / 风声' + p.wind + ' / 大势' + p.trend + ' / 势力' + p.faction + ' / 经济' + p.econ + ' / 区域' + p.region + '</div>' +
          Object.entries(r.load.blocks).map(([k, v]) => '<div class="wa-dim">' + esc(k) + '：' + (v.tokens || 0) + 't / ' + (v.chars || 0) + '字</div>').join('') +
          r.risks.map(x => '<div class="wa-log wa-log-' + x.level + '">[' + x.level + '] ' + esc(x.detail) + '</div>').join('');
      };
      const dl = $('#wa-snap-dl');
      if (dl && WA.toolSnapshot) dl.onclick = () => {
        const r = WA.toolSnapshot.download();
        $('#wa-snap-out').textContent = r.ok ? ('已导出 ' + Math.round(r.bytes / 1024) + 'KB') : ('导出失败：' + r.reason);
      };
      const up = $('#wa-snap-up');
      const upFile = $('#wa-snap-file');
      if (up && upFile) {
        up.onclick = () => upFile.click();
        upFile.onchange = async () => {
          const f = upFile.files[0]; if (!f) return;
          const txt = await f.text();
          const r = WA.toolSnapshot.restore(txt);
          $('#wa-snap-out').textContent = r.ok
            ? ('恢复成功（恢复点' + (r.recoveryCreated ? '已留' : '未留') + '）：' + JSON.stringify(r.counts))
            : ('校验/写入失败：' + r.reason);
          if (r.ok) renderBody();
          upFile.value = '';
        };
      }
      const impPick = $('#wa-imp-pick');
      const impFile = $('#wa-imp-file');
      if (impPick && impFile) {
        impPick.onclick = () => impFile.click();
        impFile.onchange = async () => {
          const f = impFile.files[0]; if (!f) return;
          $('#wa-imp-text').value = await f.text();
          impFile.value = '';
        };
      }
      const dgRun = $('#wa-diag-run');
      if (dgRun && WA.toolDiag) dgRun.onclick = () => {
        const d = WA.toolDiag.collect();
        const flat = WA.toolDiag.flatten(d);
        $('#wa-diag-out').innerHTML = '<div class="wa-item"><b>' + esc(WA.toolDiag.summaryText(d)) + '</b></div>' +
          flat.map(x => '<div class="wa-log wa-log-' + (x.level === 'error' ? 'error' : (x.level === 'warn' ? 'warn' : 'info')) + '">[' + esc(x.key) + '] ' + esc(x.detail) + '</div>').join('');
      };
      const dgDl = $('#wa-diag-dl');
      if (dgDl && WA.toolDiag) dgDl.onclick = () => {
        const r = WA.toolDiag.download();
        $('#wa-diag-out').textContent = r.ok ? ('诊断包已导出 ' + Math.round(r.bytes / 1024) + 'KB') : ('导出失败：' + r.reason);
      };
      const impRun = $('#wa-imp-run');
      if (impRun && WA.toolImport) impRun.onclick = () => {
        const out = $('#wa-imp-out');
        const raw = ($('#wa-imp-text').value || '').trim();
        if (!raw) { out.textContent = '请先选择文件或粘贴 JSON'; return; }
        const pv = WA.toolImport.preview(raw);
        const r = WA.toolImport.importData(raw);
        out.textContent = (r.ok ? '✓ [' + pv.kind + '] ' : '✗ [' + pv.kind + '] ')
          + (r.reason || ('新增 ' + (r.added || 0) + ' 条' + (r.skipped ? '，跳过 ' + r.skipped + ' 条' : '') + (r.reasons && r.reasons.length ? '（' + r.reasons.join('；') + '）' : '')));
        if (r.ok && r.added) renderBody();
      };
    }
    on('#wa-ch-start', () => { WA.chapters.start($('#wa-ch-title').value.trim()); renderBody(); });
    on('#wa-ch-end', () => { WA.chapters.end(); renderBody(); });
    on('#wa-plan-start', () => { const lines = $('#wa-plan-beats').value.split('\n').map(s => s.trim()).filter(Boolean).map(g => ({ goal: g })); if (lines.length) { WA.oracle.setPlan({ kind: 'sequence', beats: lines, current: 0 }); renderBody(); } });
    on('#wa-beat-next', () => { if (WA.oracle.plan) { WA.oracle.plan.current++; if (WA.oracle.plan.current >= WA.oracle.plan.beats.length) WA.oracle.clear(); renderBody(); } });
    on('#wa-plan-clear', () => { WA.oracle.clear(); renderBody(); });
    on('#wa-gen-choices', async () => { const out = $('#wa-choices-out'); out.textContent = '生成中…'; const cs = await WA.choices.generate(4); out.innerHTML = cs.length ? cs.map((c, i) => `<div class="wa-item">${i + 1}. ${esc(c)}</div>`).join('') : '（未配置choices通道或生成失败）'; });
    on('#wa-log-copy', () => { navigator.clipboard && navigator.clipboard.writeText(WA.eventLog.map(l => `[${new Date(l.t).toLocaleTimeString()}][${l.level}] ${l.msg} ${l.data || ''}`).join('\n')); });
    on('#wa-log-err', () => { __logErrOnly = !__logErrOnly; renderBody(); });
    on('#wa-err-report', () => { if (navigator.clipboard && WA.toolDiag && WA.toolDiag.buildErrorReport) { navigator.clipboard.writeText(WA.toolDiag.buildErrorReport()); const tip = $('#wa-err-report'); if (tip) { tip.textContent = '已复制✓'; setTimeout(() => { tip.textContent = '复制错误报告'; renderBody(); }, 1500); } } });
    on('#wa-audit-copy', () => { if (navigator.clipboard && WA.store && WA.store.exportAuditReport) { navigator.clipboard.writeText(WA.store.exportAuditReport()); const out = $('#wa-diag-out'); if (out) out.textContent = '✓ 内存/持久化审计报告 (sizeAudit) 已复制到剪贴板！'; } });
    // v0.1.52: 存储键体检——dry-run 计划 + 确认执行（二次确认制，apply 权在用户）
    const keyChk = $('#wa-key-check');
    if (keyChk) keyChk.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.store || !WA.store.storageStat) return;
      try {
        const st = WA.store.storageStat();
        if (!st.enumerable) { out.textContent = '当前环境 localStorage 不支持键枚举，无法体检'; return; }
        const plan = WA.store.sweepStaleKeys({});   // dry-run
        let html = '<div class="wa-item"><b>存储键体检</b>：worldaxis_* 键 ' + st.totalKeys + ' 个 / ' + Math.round(st.totalBytes / 1024) + 'KB（存档 ' + st.families.state + ' · 派生槽 ' + (st.families.stateDerived || 0) + ' · 恢复点 ' + st.families.recovery + ' · 诊断 ' + st.families.diagnostic + ' · 隔离 ' + st.families.corrupt + ' · 设置 ' + st.families.settings + ' · 世界书 ' + st.families.wb + '）</div>';
        if (st.currentChatQuarantines > 0) html += '<div class="wa-dim">当前聊天隔离副本 ' + st.currentChatQuarantines + ' 个（受保护不自动清理——损坏时的原始现场，确认无需回滚后可手动删除）</div>';
        if (WA.settingsBus && WA.settingsBus.stats && WA.settingsBus.stats.quarantines > 0) html += '<div class="wa-dim">settingsBus：迁移 ' + WA.settingsBus.stats.upgrades + ' 次 · 损坏隔离累计 ' + WA.settingsBus.stats.quarantines + ' 次（隔离键保留最近 5 个）</div>';
        if (!plan.remove.length) { html += '<div class="wa-log wa-log-info">✓ 无过期键可清理（当前聊天 / 设置 / 世界书键受保护）</div>'; out.innerHTML = html; return; }
        html += '<div class="wa-log wa-log-warn">可回收 ' + plan.remove.length + ' 个过期键 / ' + Math.round(plan.freedBytes / 1024) + 'KB：过期诊断 ' + (plan.byFamily['diag-idle'] || 0) + ' · 隔离溢出 ' + (plan.byFamily['corrupt-overflow'] || 0) + ' · 孤儿恢复点 ' + (plan.byFamily['orphan-recovery'] || 0) + '</div>';
        html += '<div class="wa-dim">' + plan.remove.slice(0, 8).map(r => esc(r.key)).join('<br>') + (plan.remove.length > 8 ? '<br>…等 ' + plan.remove.length + ' 项' : '') + '</div>';
        const doIt = () => { try { const done = WA.store.sweepStaleKeys({ apply: true }); $('#wa-diag-out').innerHTML = '<div class="wa-log wa-log-info">✓ 已清理 ' + done.remove.length + ' 个键，释放 ' + Math.round(done.freedBytes / 1024) + 'KB（当前聊天与设置键未动）</div>'; } catch (e) { $('#wa-diag-out').textContent = '清理失败：' + (e && e.message); } };
        html += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-key-sweep-go">确认清理（不可撤销）</button></div>';
        out.innerHTML = html;
        const go = $('#wa-key-sweep-go'); if (go) go.onclick = doIt;
      } catch (e) { out.textContent = '体检失败：' + (e && e.message); }
    };
    // v0.3.0: 隔离现场救援出口——损坏时保存的原始现场可查看/恢复/丢弃（此前只进不出）
    const qv = $('#wa-quar-view');
    if (qv) qv.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.store || !WA.store.listQuarantineSites) return;
      try {
        const sites = WA.store.listQuarantineSites();
        const qs = WA.store.quarantineStat();
        if (!sites.length) { out.innerHTML = '<div class="wa-log wa-log-info">✓ 无隔离现场（从未发生状态键损坏，或已被处置）</div>'; return; }
        let html = '<div class="wa-item"><b>隔离现场</b>：共 ' + qs.total + ' 个 / ' + Math.round(qs.bytes / 1024) + 'KB（state ' + qs.stateSites + ' · settings ' + qs.settingsSites + ' · 可解析 ' + qs.parseable + ' · 本聊天 ' + qs.currentChatSites + '）</div>';
        html += '<div class="wa-dim">state 损坏时保存的原始字节现场。「可解析」的现场可直接恢复（写前自动留恢复点）；真损坏字节只能丢弃。</div>';
        html += sites.slice(0, 6).map(s2 => '<div class="wa-log wa-log-' + (s2.parseable ? 'warn' : 'info') + '">' + esc(s2.key) + '<br><span class="wa-dim">' + Math.round(s2.bytes / 1024) + 'KB · ' + (s2.at ? new Date(s2.at).toLocaleString() : '未知时间') + (s2.chat ? ' · 聊天 ' + esc(s2.chat) : '') + (s2.parseable ? ' · 可解析' : s2.quarantine === 'state' ? ' · 真损坏' : '') + '</span></div>').join('');
        const parseable = sites.filter(s2 => s2.parseable === true);
        if (parseable.length) html += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-q-restore">恢复最近可解析现场（' + esc(parseable[0].key) + '）</button></div>';
        html += '<div class="wa-dim">恢复成功后隔离现场仍保留（审计证据），确认无用可用下方按钮丢弃。</div>';
        html += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-q-drop">丢弃最早现场</button></div>';
        out.innerHTML = html;
        const rb = $('#wa-q-restore');
        if (rb) rb.onclick = () => {
          const r = WA.store.restoreQuarantine(parseable[0].key);
          out.innerHTML = '<div class="wa-log wa-log-' + (r.ok ? 'info' : 'err') + '">' + (r.ok ? '✓ 已恢复（' + r.bytes + 'B，写前已留恢复点）' : '恢复失败：' + esc(r.reason)) + '</div>';
        };
        const db = $('#wa-q-drop');
        if (db) db.onclick = () => {
          const target = sites[sites.length - 1];
          const r = WA.store.dropQuarantine(target.key);
          out.innerHTML = '<div class="wa-log wa-log-' + (r.ok ? 'info' : 'err') + '">' + (r.ok ? '✓ 已丢弃 ' + esc(target.key) : '丢弃失败：' + esc(r.reason)) + '</div>';
        };
      } catch (e) { out.textContent = '隔离现场读取失败：' + (e && e.message); }
    };
    // v0.3.0: 恢复点导出（离机备份出口——3 个环形窗口内数据一旦被覆盖/清浏览器数据即永久丢失）
    const rdl = $('#wa-recovery-dl');
    if (rdl) rdl.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.store || !WA.store.exportRecoveryPoints) return;
      try {
        const pack = WA.store.exportRecoveryPoints();
        if (!pack.count) { out.innerHTML = '<div class="wa-log wa-log-info">当前聊天暂无恢复点（首次升级/首次存档时创建）</div>'; return; }
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'worldaxis-recovery-' + Date.now() + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        out.innerHTML = '<div class="wa-log wa-log-info">✓ 已导出 ' + pack.count + ' 个恢复点（' + Math.round(pack.bytes / 1024) + 'KB）</div>';
      } catch (e) { out.textContent = '恢复点导出失败：' + (e && e.message); }
    };
    // v0.4.0: 健康巡视——统一裁决视图（健康分 + 分级议题 + 建议动作 + 写入完整性；只读不删）
    const mtBtn = $('#wa-maintain');
    if (mtBtn) mtBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.store || !WA.store.maintain) return;
      try {
        const m = WA.store.maintain({ deep: true });
        const lv = m.level === 'ok' ? 'info' : m.level === 'warn' ? 'warn' : 'err';
        let html = '<div class="wa-log wa-log-' + lv + '">健康分 ' + m.score + '/100（' + m.level + '）· 议题 ' + m.issues.length + ' 项 · 建议动作 ' + m.actions.length + ' 项</div>';
        m.issues.forEach(x => { html += '<div class="wa-item">[' + esc(x.level) + '] ' + esc(x.key) + '：' + esc(x.detail) + '</div>'; });
        m.actions.forEach(a => { html += '<div class="wa-item">建议：' + esc(a.detail) + (a.safe ? '（安全）' : '（需人工确认）') + '</div>'; });
        const ig = WA.store.integrityStat ? WA.store.integrityStat() : null;
        if (ig) html += '<div class="wa-log wa-log-info">写入完整性：校验 ' + ig.verified + '/' + ig.writes + ' 次 · 不一致 ' + ig.mismatches + ' · 重试自愈 ' + ig.recoveredByRetry + ' · 当前态 ' + (ig.lastOk === null ? '未采样' : ig.lastOk ? '正常' : '失败') + '</div>';
        if (!m.issues.length && !m.actions.length) html += '<div class="wa-log wa-log-info">✓ 无议题、无建议动作（存储键空间与状态库健康）</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '健康巡视失败：' + (e && e.message); }
    };
    // v0.5.0: 冲突现场——另一实例被覆盖前的进度快照（提取/丢弃，需人工决策保留哪一份）
    const cfBtn = $('#wa-conf-view');
    if (cfBtn) cfBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.store || !WA.store.listConflicts) return;
      try {
        const sites = WA.store.listConflicts();
        const xs = WA.store.externalWriteStat ? WA.store.externalWriteStat() : null;
        let html = '';
        if (xs && xs.count > 0) {
          html += '<div class="wa-log wa-log-warn">⚠ 本会话期间另一实例更新过当前聊天 ' + xs.count + ' 次（最近序号 ' + xs.lastRev + '）——本窗口内存态可能已落后，建议刷新页面</div>';
        }
        if (!sites.length) {
          html += '<div class="wa-log wa-log-info">✓ 无并发冲突现场（从未发生多实例同时写入，或已处置）</div>';
          out.innerHTML = html; return;
        }
        html += '<div class="wa-log wa-log-warn">检测到 ' + sites.length + ' 个冲突现场：另一实例的改动在下一次保存时被覆盖前已被保全。请确认要保留哪一份。</div>';
        sites.forEach(x => {
          html += '<div class="wa-item"><b>' + esc(String(x.head || '(无摘要)')) + '</b><br>'
            + esc(new Date(x.at).toLocaleString()) + ' · ' + Math.round(x.bytes / 1024) + 'KB · ' + (x.parseable ? '可解析' : '不可解析') + '</div>';
        });
        const first = sites[sites.length - 1];
        html += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-conf-dl">提取最近一份</button>'
          + '<button class="wa-btn wa-mini" id="wa-conf-drop">丢弃最近一份</button></div>';
        out.innerHTML = html;
        const dl = $('#wa-conf-dl');
        if (dl) dl.onclick = () => {
          const pack = WA.store.exportConflict(first.key);
          if (!pack.ok) { $('#wa-diag-out').innerHTML = '<div class="wa-log wa-log-err">提取失败：' + esc(pack.reason) + '</div>'; return; }
          const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'worldaxis-conflict-' + Date.now() + '.json';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          out.innerHTML = '<div class="wa-log wa-log-info">✓ 已提取冲突快照（' + Math.round(pack.bytes / 1024) + 'KB）——含另一实例的完整世界状态，可离线核对</div>';
        };
        const dp = $('#wa-conf-drop');
        if (dp) dp.onclick = () => {
          const r = WA.store.dropConflict(first.key);
          out.innerHTML = '<div class="wa-log wa-log-' + (r.ok ? 'info' : 'err') + '">' + (r.ok ? '✓ 已丢弃该冲突现场' : '丢弃失败：' + esc(r.reason)) + '</div>';
        };
      } catch (e) { out.textContent = '冲突现场读取失败：' + (e && e.message); }
    };
    const conc = $('#wa-conc'); if (conc) conc.oninput = () => { WA.apiRouter.setConcurrency(+conc.value); $('#wa-conc-v').textContent = conc.value; };
    // 设置页绑定
    if (currentPage === 'settings' && WA.uiSettings) WA.uiSettings.bind(panelEl);
    // 助手页绑定
    const askBtn = $('#wa-ask-btn');
    if (askBtn) askBtn.onclick = async () => { const q = $('#wa-ask-input').value.trim(); if (!q) return; const out = $('#wa-ask-out'); out.textContent = '思考中…'; const r = await WA.assistant.ask(q); out.textContent = r.ok ? r.text : ('失败：' + r.reason); };
    const thBtn = $('#wa-theater-btn');
    if (thBtn) thBtn.onclick = async () => { const out = $('#wa-theater-out'); out.textContent = '剧场编排中…'; const r = await WA.theater.generate($('#wa-theater-input').value.trim()); out.textContent = r.ok ? r.text : ('失败：' + (r.reason || (r.error && r.error.message))); };
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
