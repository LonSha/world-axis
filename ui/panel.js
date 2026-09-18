/**
 * WorldAxis ui/panel.js — 主面板 + 悬浮球
 * 设计：冷峻控制台风格（深色玻璃拟态 + 单色强调），分「概览/世界/人物/事件/导演/连接/日志」七页
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
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
  // v2.13.0: 挤出侧可见出口（概览页）。
  //   为什么必须放在这里：挤出是本仓库唯一「按设计把数据丢掉」的路径，而它是静默的——
  //   「长局 200 轮后 NPC 只剩 48 个」「伏笔被终态条目挤掉」此前在面板上毫无痕迹，
  //   用户只能凭记忆发现少了谁。本块把「谁在丢、丢了多少、最近丢的是谁」摆到概览页。
  //   刻意**不引入任何控件**（纯展示）：UI 绑定守卫要求每个控件都有绑定，而这里不需要交互；
  //   需要动作时去「诊断」页看逐站点明细。
  function evictBlock() {
    try {
      const st = (WA.evict && typeof WA.evict.evictStat === 'function') ? WA.evict.evictStat() : null;
      if (!st) return '';
      if (!st.evicts && !st.evictFailed) {
        return '<div class="wa-sec">容量收纳</div><div class="wa-list"><div class="wa-item wa-dim">本轮尚未发生容量挤出（' + st.sites + ' 个站点在位，数据均在各自上限内）</div></div>';
      }
      if (st.evictFailed > 0) {
        return '<div class="wa-sec">容量收纳</div><div class="wa-list">'
          + '<div class="wa-item"><b>挤出失败 ' + st.evictFailed + ' 次</b>（' + esc(JSON.stringify(st.failedBy || {}))
          + '）——站点未登记或参数非法，数据未被截断而是继续超限增长，须改代码。</div></div>';
      }
      const rows = Object.keys(st.bySite || {}).sort(function (a, b) { return st.bySite[b].dropped - st.bySite[a].dropped; }).slice(0, 6)
        .map(function (k) {
          const b = st.bySite[k];
          // v2.13.0（端到端审计自纠）：逐站点显示「丢的是谁」——全局最近 12 条在多站点场景下
          //   会被后发生的站点冲掉，等于最需要看的那个站点反而看不到明细。
          const w = (b.lastWhat || []).slice(-2).join('、');
          return '<div class="wa-item"><span class="wa-dim">' + esc(k) + '</span> 丢弃 ' + b.dropped + ' 项 / ' + b.evicts + ' 次'
            + (w ? '：' + esc(w) : '') + '</div>';
        }).join('');
      const what = (st.lastDropped || []).slice(-3).map(function (x) { return esc(x.site + '→' + x.what); }).join('、');
      return '<div class="wa-sec">容量收纳（共挤出 ' + st.evicts + ' 次 / 丢弃 ' + st.evicted + ' 项）</div>'
        + '<div class="wa-list">' + rows
        + (what ? '<div class="wa-item wa-dim">最近被挤出：' + what + '</div>' : '')
        + '</div>';
    } catch (e) { return ''; }
  }
  // ── v2.14.0: 随机源（第八面：可复现性）──────────────────────
  // 为什么放这里：本页已有「容量收纳」（挤出侧）告诉用户「丢了谁」，
  //   而「谁会被丢」是随机采样挑的——不把随机源状态摆出来，
  //   用户看到两次不同的挤出结果会以为是引擎不稳定。
  // 纯展示，不引入任何控件（因此不触碰 UI 绑定守卫 G17）。
  function randBlock() {
    let st = null;
    try { st = WA.rand && WA.rand.randStat ? WA.rand.randStat() : null; } catch (e) { st = null; }
    if (!st) return '';
    const src = st.seedSource === 'explicit' ? '已显式播种（可复现）' : (st.seedSource === 'auto' ? '自动种子（本会话不可复现）' : '尚未使用');
    const chans = (st.channelNames || []).map(function (c) { return c + '(' + ((st.byChannel || {})[c] || 0) + ')'; }).join('、');
    const bad = st.failed > 0 ? '<span class="wa-bad">｜参数非法 ' + st.failed + ' 次（' + escapeHtml(JSON.stringify(st.failedBy || {})) + '）</span>' : '';
    return '<div class="wa-card"><div class="wa-card-h">随机源（决策可复现性）</div>' +
      '<div class="wa-kv">种子：<b>' + src + '</b>' + bad + '</div>' +
      '<div class="wa-kv">决策抽取：' + st.draws + ' 次｜生成 id：' + st.ids + ' 个（id 走独立通道，不占用决策序列）</div>' +
      '<div class="wa-kv">通道：' + (chans || '（本会话尚未抽取）') + '</div>' +
      '<div class="wa-hint">要复现某次运行：控制台执行 <code>WorldAxis.rand.seed(数字)</code>，之后决策流同种子同序列。<br>' +
      '「同样操作两次结果不同」不是引擎不稳定——是随机源没有定住。</div></div>';
  }
  // v2.15.0: 时间源（第九面：可复现性的另一半）——纯展示、不引入控件。
  //   与随机源块并列的理由：可复现性要两个输入同时确定，而用户在面板上只看得见「种子」那一半，
  //   看不见「时刻」那一半，于是「我明明播种了，怎么还是对不上」会变成一个没有出口的问题。
  function clockBlock() {
    let st = null;
    try { st = WA.clock && WA.clock.clockStat ? WA.clock.clockStat() : null; } catch (e) { st = null; }
    if (!st) return '';
    const mode = st.frozen
      ? '已冻结在 <b>' + new Date(st.virtualAt).toLocaleString() + '</b>（存档时间戳可复现）'
      : '跟墙钟走（本会话存档时间戳不可复现）';
    const sites = (st.siteNames || []).map(function (c) { return c + '(' + ((st.bySite || {})[c] || 0) + ')'; }).join('、');
    const bad = st.failed > 0 ? '<span class="wa-bad">｜参数非法 ' + st.failed + ' 次（' + escapeHtml(JSON.stringify(st.failedBy || {})) + '）</span>' : '';
    const dft = st.frozen && st.drift > 60000 ? '｜与真实时刻已偏差 ' + Math.round(st.drift / 60000) + ' 分钟（冻结期间的正常现象）' : '';
    return '<div class="wa-card"><div class="wa-card-h">时间源（存档可复现性）</div>' +
      '<div class="wa-kv">决策时钟：' + mode + bad + '</div>' +
      '<div class="wa-kv">决策读取：' + st.nowCalls + ' 次｜测量读取：' + st.wallCalls + ' 次（耗时台账与展示，不受冻结影响）</div>' +
      '<div class="wa-kv">站点：' + (sites || '（本会话尚未读取）') + dft + '</div>' +
      '<div class="wa-hint">要复现某次运行：控制台执行 <code>WorldAxis.clock.freeze(时刻戳)</code>，之后所有进存档的时间戳都取这个虚拟时刻<br>' +
      '（每轮用 <code>WorldAxis.clock.advance()</code> 推进；<code>unfreeze()</code> 回到墙钟）。刷新页面即解除——冻结是会话内的显式动作。</div></div>';
  }
  // v2.16.0: 对外只读互操作桥（另两个插件能不能读到这个世界）——纯展示、不引入控件。
  //   为什么放这里：本页此前所有块讲的都是「本扩展自己怎么看世界」。而这个世界同时被
  //   RubyPhone 的世界脉搏/TimeManager 与 LonSha 的世界推进各自描述一遍——「两边对不上」
  //   的用户困惑，根因就在「桥关着」或「桥发不出去」这两件在界面上完全看不见的事上。
  function bridgeBlock() {
    let st = null, cfg = null;
    try { st = WA.bridge && WA.bridge.stat ? WA.bridge.stat() : null; } catch (e) { st = null; }
    try { cfg = WA.bridge && WA.bridge.settings ? WA.bridge.settings() : null; } catch (e) { cfg = null; }
    if (!st) return '';
    const on = cfg && cfg.enabled === true;
    const mode = on ? '<b>已开闸</b>（外部可读到世界状态）' : '休眠（外部读到 null）';
    const bad = st.failures > 0 ? '<span class="wa-bad">｜发布失败 ' + st.failures + ' 次（' + esc((st.lastFailure || {}).reason || '?') + '）</span>' : '';
    const warn = (!on && st.externalReads > 0) ? '<span class="wa-bad">｜外部已读 ' + st.externalReads + ' 次却全是 null——对方看起来像「世界是空的」</span>' : '';
    const inv = Object.keys(st.byInvalidate || {}).map(function (k) { return k + '(' + st.byInvalidate[k] + ')'; }).join('、');
    return '<div class="wa-card"><div class="wa-card-h">对外桥（世界状态外供 · worldaxis_bridge_v1）</div>' +
      '<div class="wa-kv">闸门：' + mode + bad + warn + '</div>' +
      '<div class="wa-kv">发布 ' + st.publishes + ' 次｜floor=' + st.publishedFloor + '｜' + (st.snapshotBytes || 0) + ' 字节｜外部读取 ' + st.externalReads + ' 次</div>' +
      '<div class="wa-kv">作废 ' + st.invalidations + ' 次（' + (inv || '尚无') + '）｜去抖跳过 ' + st.debounced + ' 次</div>' +
      '<div class="wa-hint">这是本扩展**唯一**对外接口，与 LonSha 的 <code>lonsha_memory_bridge_v1</code> 同规格（只读投影／纯读不抛／深拷贝）。<br>' +
      '开闸：<code>WorldAxis.bridge.setSettings({ enabled: true })</code>；外部取数：<code>WorldAxis.bridge.snapshot()</code>（返回深拷贝，受 ' + st.floorGap + ' 楼间隔与去抖保护）。<br>' +
      '默认休眠的理由：快照要 clone 世界状态，无事时不该付出这份开销。</div></div>';
  }
  // v2.17.0: 记忆桥消费面（另一个插件记的那本账，本扩展读不读得到）——纯展示。
  //   与上面的 bridgeBlock 互为镜像：那一块讲「我发得出去吗」，这一块讲「我读得进来吗」。
  //   此前本扩展对 lonsha_memory_bridge_v1 的引用**全在注释与提示文本里**，产品代码零消费，
  //   于是「LonSha 记的今天是几号」在本扩展侧完全不可观测。这一块把它摆出来。
  function lonshaBlock() {
    let hasLonsha = false;
    try { hasLonsha = !!(WA.lonshaReader && typeof WA.lonshaReader.readLonshaSnapshot === 'function'); } catch (e) { hasLonsha = false; }
    if (!hasLonsha) {
      return '<div class="wa-card"><div class="wa-card-h">记忆桥（读 LonSha 账本 · lonsha_memory_bridge_v1）</div>' +
        '<div class="wa-kv">消费面未加载（读不到另一个插件记的那本账）</div></div>';
    }
    const read = WA.lonshaReader.readLonshaSnapshot({ refresh: false });
    if (!read.ok) {
      return '<div class="wa-card"><div class="wa-card-h">记忆桥（读 LonSha 账本 · lonsha_memory_bridge_v1）</div>' +
        '<div class="wa-kv">不可读：' + esc(WA.lonshaReader.describeLonsha(read)) + '</div>' +
        '<div class="wa-hint">归因 <code>' + esc(String(read.reason || '?')) + '</code>——'
        + '"对方还没就绪"（稍后再读）与"对方坏了"（该查）是两件事，不该同形。<br>'
        + 'LonSha 未安装是常见合法配置；已安装却读不到，才需要看它的 <code>sourceState</code> / <code>lastError</code>。</div></div>';
    }
    const sum = WA.lonshaReader.summarizeSnapshot(read.snapshot);
    const d = WA.lonshaReader.diffWithLonsha(read.snapshot);
    const VD = {
      same: '两钟同日', 'world-ahead': '本扩展世界钟在前 ' + Math.abs(Number(d.days) || 0) + ' 天',
      'world-behind': '本扩展世界钟在后 ' + Math.abs(Number(d.days) || 0) + ' 天',
      'lonsha-empty': '对方尚未记录时间',
      'world-uncomparable': '本扩展世界钟为自由标签（本就不比）',
      unparsable: '日期串读不出'
    };
    const bad = (d.verdict === 'world-ahead' || d.verdict === 'world-behind');
    return '<div class="wa-card"><div class="wa-card-h">记忆桥（读 LonSha 账本 · lonsha_memory_bridge_v1）</div>' +
      '<div class="wa-kv">对账：' + (bad ? '<span class="wa-bad">' : '') + esc(VD[d.verdict] || d.verdict) + (bad ? '</span>' : '') + '</div>' +
      '<div class="wa-kv">本扩展 ' + esc(d.worldDate || '（无公历钟）') + ' ｜LonSha ' + esc(d.lonshaDate || '（未记录）') + '</div>' +
      '<div class="wa-kv">对方快照：floor=' + (sum.floor || 0) + '｜' + (sum.selfBytes || 0) + ' 字节｜契约 '
      + esc(sum.contract || '未自述') + (sum.pluginVersion ? '｜版本 ' + esc(sum.pluginVersion) : '') + '</div>' +
      (sum.absent.length || sum.nullish.length
        ? '<div class="wa-kv">未外供 ' + esc(sum.absent.join('、') || '—') + '｜显式为空 ' + esc(sum.nullish.join('、') || '—') + '</div>'
        : '') +
      '<div class="wa-hint">这是本扩展对 LonSha 记忆桥的**唯一**消费点（此前全库零消费，引用只在注释里）。<br>' +
      '只读：不写对方的账本、不改本扩展的世界钟——两个钟对不上只报不管，<b>谁拍板由用户决定</b>。<br>' +
      '「未外供」与「显式为空」是两件事（本扩展尊重对方 v3.174 的三态自述），故分别列出。</div></div>';
  }
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
      ${evictBlock()}${randBlock()}${clockBlock()}${bridgeBlock()}${lonshaBlock()}
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
      ${(() => {
        // v2.1.0: 自动推进可见（此前 suggestAdvance 零消费，时间只能手动设）
        if (!WA.calendar || typeof WA.calendar.stat !== 'function') return '<div class="wa-dim">自动推进不可用（世界钟模块缺失）</div>';
        const cs = WA.calendar.stat();
        return `<label class="wa-node"><input type="checkbox" id="wa-cal-auto" ${cs.auto ? 'checked' : ''}/><span class="wa-node-label">正文时间词自动推进</span></label>
          <div class="wa-dim">已推进 ${cs.advanced} 次 / 检查 ${cs.runs} 次 · 去重跳过 ${cs.deduped} · 无时间词 ${cs.noSignal}${cs.lastLabel ? ' · 最近：' + esc(cs.lastKind) + ' → ' + esc(cs.lastLabel) : ''}</div>`;
      })()}
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
          <button class="wa-btn wa-mini" data-prof="${esc(p.name)}">档案</button>
        </div>`).join('') || '<div class="wa-empty">世界推演后自动出现</div>'}</div>
      <div class="wa-sec">人物档案（供独白/观测子agent 作为认知边界与性格锚点）</div>
      <div id="wa-prof-mini" class="wa-dim">${(() => {
        // v2.2.0: 档案覆盖率可见——此前「性格锚点：未建立」没有任何解释入口
        if (!WA.registry || typeof WA.registry.profileStat !== 'function') return '档案计量不可用';
        const ps = WA.registry.profileStat();
        return ps.registered ? ('已建档 ' + ps.withProfile + '/' + ps.registered + ' 个 NPC（' + ps.entries + ' 条）— 点人名后的「档案」录入') : '尚无注册 NPC';
      })()}</div>
      <div id="wa-prof-out" class="wa-out"></div>
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

    // v2.11.0: 编辑态接线——`editorFaction.getEditingId` / `editorEvents.getEditingId` 此前
    //   全库零调用（真功能断链）：编辑器把「我在改哪一项」存在模块级变量里，但那个变量
    //   对外只有一个读写口而**没有任何消费端**，于是「改到一半切走页面再回来」时，
    //   用户无法知道自己刚才在编辑哪一项（列表里每一项长得一样）。
    const __efCur = (WA.editorFaction && typeof WA.editorFaction.getEditingId === 'function') ? WA.editorFaction.getEditingId() : null;
    const __eeCur = (WA.editorEvents && typeof WA.editorEvents.getEditingId === 'function') ? WA.editorEvents.getEditingId() : null;
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
      ${(() => {
        // v2.3.0 块3: 通道开关与掷骰留痕上线——此前只显示 ledger/cooldown，
        //   「通道被关闭」与「通道开着但一直没掷中」在面板上完全一样（都只是 ledger 在涨）。
        const hzEn = (WA.horizon && WA.horizon.stat) ? WA.horizon.stat() : null;
        const badge = k => (hzEn && hzEn.enabled && hzEn.enabled[k] === false) ? ' <span class="wa-badge">关</span>' : '';
        const lane = (k, label) => {
          const l = hz[k];
          if (!l) return label + ' —';
          return label + badge(k) + ` ledger=${l.ledger} cd=${l.cooldown}${l.pending ? ' ⏳' : ''}`;
        };
        const tail = hzEn ? `<div class="wa-dim">掷骰 ${hzEn.rolls} 次 · 触发 远${hzEn.distantFired}/近${hzEn.nearFired} · 跳过（关） ${hzEn.skipped}${hzEn.lastReason ? ' · 最近：' + esc(hzEn.lastReason) : ''}</div>` : '';
        return `<div class="wa-item wa-dim">${lane('distant', '远方')}<br>${lane('near', '近端')}${tail}</div>`;
      })()}

<div class="wa-sec">世界推演</div>
      ${(() => {
        // v2.11.0: 运行态/排队态/中止能力接线——`backstage.isRunning` / `pending` / `abort`
        //   三个导出此前**全库零调用**（真功能断链）：推演是多轮异步任务，运行期间用户既看不到
        //   「在跑」，也**无法中止**（只能刷新页面），而 AbortController 早就实现在引擎里
        //   （`abort()` 会 signal 到 `_runInference`，`_start` 里有 `ac.signal.aborted` 判据）。
        //   代价说明：`_start` 的 finally 里会把 `currentTask` 清空并在有 pending 时自动接续——
        //   中止后排队项仍会执行，这是既有语义（catch-up），面板如实显示排队原因而不隐藏它。
        if (!WA.backstage || typeof WA.backstage.isRunning !== 'function') return '<div class="wa-dim">推演引擎不可用</div>';
        const __bsRun = WA.backstage.isRunning();
        const __bsPend = (typeof WA.backstage.pending === 'function') ? WA.backstage.pending() : null;
        return '<div class="wa-item">'
          + (__bsRun ? '<span class="wa-badge wa-on">运行中</span> 世界推演正在结算（镜头之外的世界仍在继续）'
                     : '<span class="wa-badge">空闲</span> 世界推演未运行')
          + (__bsPend ? '<div class="wa-dim">已排队 1 次——当前任务结束后接续（原因：' + esc(__bsPend.reason || 'catch-up') + '）</div>' : '')
          + (__bsRun ? '<button class="wa-btn wa-mini" id="wa-bs-abort">中止推演</button>' : '')
          + '</div>';
      })()}

      <div class="wa-sec">演化事件（${(ev.events||[]).length}）</div>
      ${(() => {
        // v2.2.0: 入账留痕——此前推演宣告的事件（events_create）被整条丢弃而面板毫无提示
        if (!WA.backstage || typeof WA.backstage.applyStat !== 'function') return '';
        const as = WA.backstage.applyStat();
        if (!as.eventsCreated && !as.eventsUpdated && !as.eventsLoose) return '<div class="wa-dim">推演事件入账：尚无记录（下次世界推演结算后可见）</div>';
        return '<div class="wa-dim">推演事件入账：新增 ' + as.eventsCreated + ' · 更新 ' + as.eventsUpdated + ' · 无对应事件 ' + as.eventsLoose + (as.lastAt ? ' · 最近 ' + new Date(as.lastAt).toLocaleTimeString() : '') + '</div>';
      })()}
      <div class="wa-list">${(ev.events||[]).slice(-10).reverse().map(e => `<div class="wa-item"><span class="wa-badge">${esc(e.type === 'conflict' ? '冲突' : '进度')}</span> <b>${esc(e.name || e.title || '')}</b> <span class="wa-dim">${esc(e.stage)}${e.stall?' ':''}</span></div>`).join('') || '<div class="wa-empty">暂无</div>'}</div>

      <div class="wa-sec">势力编辑器（结构化手动增删改）</div>
      ${WA.editorFaction ? `
        <div class="wa-row"><input id="wa-ef-name" class="wa-input" placeholder="名称"/><input id="wa-ef-scope" class="wa-input wa-w60" placeholder="范围"/></div>
        <div class="wa-row"><input id="wa-ef-goal" class="wa-input" placeholder="当前目标"/><input id="wa-ef-core" class="wa-input wa-w60" placeholder="核心人物"/></div>
        <div class="wa-row"><input id="wa-ef-pillars" class="wa-input" placeholder="权力支柱（逗号分隔，≤4字）"/><button class="wa-btn" id="wa-ef-add">新增势力</button></div>
        <div class="wa-list">${(WA.editorFaction.list(s) || []).map((f, i) => `<div class="wa-item${__efCur === i ? ' wa-editing' : ''}"><b>${esc(f.name)}</b> <span class="wa-badge">${esc(f.status)}</span> <span class="wa-dim">${esc(f.relation)} · ${esc(f.scope||'—')}</span>${__efCur === i ? ' <span class="wa-badge wa-on">编辑中</span>' : ''}
          <div class="wa-dim">支柱：${esc((f.powerPillars||[]).join('、')||'—')}</div>
          <button class="wa-btn wa-mini" data-ef-edit="${i}">改状态</button><button class="wa-btn wa-mini" data-ef-copy="${i}">复制</button><button class="wa-btn wa-mini" data-ef-del="${i}">删除</button></div>`).join('') || '<div class="wa-empty">暂无势力</div>'}</div>
        <div class="wa-dim">声誉总压：${WA.editorFaction.reputationPressure(s).pressure} / ±${WA.editorFaction.reputationPressure(s).cap}</div>` : '<div class="wa-empty">势力编辑器未加载</div>'}
      <div class="wa-sec">事件编辑器</div>
      ${WA.editorEvents ? `
        <div class="wa-row"><input id="wa-ee-name" class="wa-input" placeholder="事件名"/><select id="wa-ee-type" class="wa-input wa-w60"><option value="conflict">冲突型</option><option value="progress">推进型</option></select><button class="wa-btn" id="wa-ee-add">新增事件</button></div>
        <div class="wa-list">${(WA.editorEvents.list(s) || []).map((e, i) => `<div class="wa-item${__eeCur === i ? ' wa-editing' : ''}"><b>${esc(e.name)}</b> <span class="wa-badge">${e.type === 'conflict' ? '冲突' : '进度'} Lv.${e.level}</span> <span class="wa-dim">${esc(e.stage)} ${e.stageRound||1}/9</span>${__eeCur === i ? ' <span class="wa-badge wa-on">编辑中</span>' : ''}
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
      <div class="wa-sec">AI 剧情参谋（judge 通道）</div>
      <div class="wa-row"><input id="wa-or-goal" class="wa-input" placeholder="剧情目标（如「揭开蒙面人身份」）…"/><input id="wa-or-beats" class="wa-input wa-num" type="number" min="1" max="12" value="5"/></div>
      <button class="wa-btn" id="wa-or-gen">AI 生成弧线</button>
      <div id="wa-or-out" class="wa-out">${(() => {
        // v2.1.0: 参谋留痕（此前 generatePlan 零调用，AI 弧线能力形同虚设）
        if (!WA.oracle || typeof WA.oracle.stat !== 'function') return '';
        const os = WA.oracle.stat();
        const base = '已生成 ' + os.generated + ' 次 / 尝试 ' + os.runs + ' 次';
        const tail = os.lastReason ? ' · 上次失败：' + esc(os.lastReason) : (os.lastCount ? ' · 上次 ' + os.lastCount + ' 拍' : '');
        return '<span class="wa-dim">' + base + tail + '</span>';
      })()}</div>
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
      <div class="wa-row"><button class="wa-btn" id="wa-diag-run">立即自检</button><button class="wa-btn" id="wa-diag-dl">导出诊断包</button><button class="wa-btn" id="wa-audit-copy">复制内存审计</button><button class="wa-btn" id="wa-key-check">存储键体检</button><button class="wa-btn" id="wa-quar-view">隔离现场</button><button class="wa-btn" id="wa-recovery-dl">导出恢复点</button><button class="wa-btn" id="wa-maintain">健康巡视</button><button class="wa-btn" id="wa-conf-view">冲突现场</button><button class="wa-btn" id="wa-settle-view">结算守卫</button><button class="wa-btn" id="wa-stat-reset">清零计量</button><button class="wa-btn" id="wa-compat-view">宿主兼容层</button><button class="wa-btn" id="wa-wf-reset">清空运行痕迹</button><button class="wa-btn" id="wa-recovery-view">存档恢复点</button><button class="wa-btn" id="wa-orphan-view">设置键</button></div>
      <div class="wa-dim">只读体检：模块装载完整性、上轮注入是否真进 prompt、面板控件绑定、视图开关、工作流与API通道。不含聊天正文与密钥。</div>
      <div id="wa-diag-out" class="wa-out"></div>`;
  }

  // v2.2.0: 档案编辑器（分节）——setProfileSafe 是唯一安全写入入口，此前零 UI
  function renderProfileEditor(name) {
    const p = WA.registry.getProfile(name);
    const vals = {
      personality: (p.personality || []).map(x => x.text || x).join('\n'),
      worldview: (p.worldview || []).map(x => x.text || x).join('\n'),
      family: (p.family || []).map(x => x.text || x).join('\n'),
      memory: (p.memory || []).map(x => x.text || x).join('\n'),
      relationships: (p.relationships || []).map(x => [x.target, x.relation, x.dynamic].join(' | ')).join('\n')
    };
    const ta = (id, label, hint, v) => `<div class="wa-sec">${label} <span class="wa-dim">${hint}</span></div><textarea id="${id}" class="wa-ta" placeholder="${hint}">${esc(v)}</textarea>`;
    return `<div class="wa-item"><b>「${esc(name)}」人物档案</b><div class="wa-dim">每行一条。保存后作为该 NPC 的认知边界与性格锚点（独白推演/观测切片共同消费）。</div></div>`
      + ta('wa-prof-personality', '性格', '每行一条性格锚点', vals.personality)
      + ta('wa-prof-worldview', '观念', '每行一条价值取向', vals.worldview)
      + ta('wa-prof-family', '家庭', '每行一条家庭关系', vals.family)
      + ta('wa-prof-memory', '经历', '每行一条关键经历', vals.memory)
      + ta('wa-prof-relationships', '关系动态', '每行：对象 | 关系 | 最新动态', vals.relationships)
      + `<div class="wa-row"><button class="wa-btn wa-mini" id="wa-prof-save">保存档案（整节替换）</button>`
      + `<button class="wa-btn wa-mini" id="wa-prof-clear">清空档案</button></div>`
      + `<div id="wa-prof-msg" class="wa-dim"></div>`;
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
      <div class="wa-row"><button class="wa-btn wa-mini" id="wa-theater-insert" disabled>插入输入框</button><button class="wa-btn wa-mini" id="wa-theater-copy">复制</button></div>
      <div id="wa-theater-out" class="wa-out">${(() => {
        // v2.2.0: 剧场产出留痕（此前 wrap 零调用，产物送不出去也无人知情）
        if (!WA.theater || typeof WA.theater.stat !== 'function') return '';
        const ts = WA.theater.stat();
        if (!ts.generated && !ts.failed) return '';
        return '<span class="wa-dim">已生成 ' + ts.generated + ' 次 · 送达 ' + ts.sent + ' 次'
          + (ts.failed ? ' · 失败 ' + ts.failed : '') + (ts.sendFailed ? ' · 送达失败 ' + ts.sendFailed : '')
          + (ts.lastReason ? ' · 最近：' + esc(ts.lastReason) : '') + '</span>';
      })()}</div>`;
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
    // v2.2.0: 档案入口——此前 setProfile 零调用，用户没有任何建档途径（推演的性格锚点永远未建立）
    let profEditing = null;
    panelEl.querySelectorAll('[data-prof]').forEach(b => b.onclick = () => {
      profEditing = b.dataset.prof;
      const out = $('#wa-prof-out'); if (!out) return;
      out.innerHTML = renderProfileEditor(profEditing);
      const sv = $('#wa-prof-save');
      if (sv) sv.onclick = () => {
        const read = (id) => ($(id) ? $(id).value : '');
        const r = WA.registry.setProfileSafe(profEditing, {
          personality: read('#wa-prof-personality'), worldview: read('#wa-prof-worldview'),
          family: read('#wa-prof-family'), memory: read('#wa-prof-memory'),
          relationships: read('#wa-prof-relationships')
        }, { replace: true });
        const msg = $('#wa-prof-msg');
        if (msg) msg.textContent = r.ok ? ('✓ 已保存（共 ' + r.total + ' 条' + (r.rejected && r.rejected.length ? '，拒收 ' + r.rejected.length + ' 条' : '') + '）') : ('保存失败：' + r.reason);
        if (r.ok) renderBody();
      };
      const cl = $('#wa-prof-clear');
      if (cl) cl.onclick = () => {
        const r = WA.registry.clearProfile(profEditing);
        const msg = $('#wa-prof-msg');
        if (msg) msg.textContent = r.ok ? '✓ 已清空档案' : ('清空失败：' + r.reason);
        if (r.ok) renderBody();
      };
    });
    const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
    on('#wa-save-bg', () => { WA.store.patch('background', { text: $('#wa-bg').value, updatedAt: clockNow('ui.panel') }); WA.log('info', '世界背景已保存'); });
    on('#wa-set-clock', () => { const v = prompt('设定世界时间（如「三日目·黄昏」）：', WA.store.read('clock.label', '')); if (v != null) { WA.calendar.setClock(v); renderBody(); } });
    on('#wa-cal-auto', () => {});
    { const cb = $('#wa-cal-auto');
      if (cb) cb.onchange = () => { WA.calendar.setSettings({ auto: cb.checked }); WA.log('info', '世界钟自动推进已' + (cb.checked ? '开启' : '关闭')); renderBody(); }; }
    on('#wa-npc-add', () => { const v = $('#wa-npc-name').value.trim(); if (v) { WA.registry.register(v); renderBody(); } });
    on('#wa-de-create', async () => { const p = $('#wa-de-prompt').value.trim(); const t = +$('#wa-de-turns').value || 6; const btn = $('#wa-de-create'); btn.textContent = '生成中…'; await WA.directEvent.create({ prompt: p, turns: t }); renderBody(); });
    on('#wa-de-abort', () => { WA.directEvent.abort(); renderBody(); });
    // v2.11.0: 推演中止——引擎侧 `abort()` 已实现却无人调用（用户只能刷页面打断）
    on('#wa-bs-abort', () => { WA.backstage.abort(); WA.log('warn', '世界推演已请求中止'); renderBody(); });
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
      panelEl.querySelectorAll('[data-ef-del]').forEach(b => b.onclick = () => { WA.store.transact(d => WA.editorFaction.remove(d, +b.dataset.efDel)); if (typeof WA.editorFaction.setEditingId === 'function') WA.editorFaction.setEditingId(null); renderBody(); });
      panelEl.querySelectorAll('[data-ef-copy]').forEach(b => b.onclick = () => { WA.store.transact(d => WA.editorFaction.copy(d, +b.dataset.efCopy)); renderBody(); });
      panelEl.querySelectorAll('[data-ef-edit]').forEach(b => b.onclick = () => {
        // v2.11.0: 编辑态唯一的写入口（此前 setEditingId 零调用 ⇒ 阅读态永远无标记可显示）
        if (typeof WA.editorFaction.setEditingId === 'function') WA.editorFaction.setEditingId(+b.dataset.efEdit);
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
      panelEl.querySelectorAll('[data-ee-next]').forEach(b => b.onclick = () => { if (typeof WA.editorEvents.setEditingId === 'function') WA.editorEvents.setEditingId(+b.dataset.eeNext); WA.store.transact(d => WA.editorEvents.shiftStage(d, +b.dataset.eeNext, 1)); renderBody(); });
      panelEl.querySelectorAll('[data-ee-prev]').forEach(b => b.onclick = () => { if (typeof WA.editorEvents.setEditingId === 'function') WA.editorEvents.setEditingId(+b.dataset.eePrev); WA.store.transact(d => WA.editorEvents.shiftStage(d, +b.dataset.eePrev, -1)); renderBody(); });
      panelEl.querySelectorAll('[data-ee-del]').forEach(b => b.onclick = () => { WA.store.transact(d => WA.editorEvents.remove(d, +b.dataset.eeDel)); if (typeof WA.editorEvents.setEditingId === 'function') WA.editorEvents.setEditingId(null); renderBody(); });
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
    // v2.1.0: 走 oracle.advance()（单一实现）——此前直接 plan.current++ 不落盘、末拍不清理
    on('#wa-beat-next', () => { if (WA.oracle.plan) { WA.oracle.advance(); renderBody(); } });
    on('#wa-or-gen', async () => {
      const btn = $('#wa-or-gen'), out = $('#wa-or-out');
      const goal = $('#wa-or-goal').value.trim();
      const n = Math.max(1, Math.min(12, +$('#wa-or-beats').value || 5));
      if (!goal) { if (out) out.textContent = '请填写剧情目标'; return; }
      if (btn) { btn.textContent = '生成中…'; btn.disabled = true; }
      const r = await WA.oracle.generatePlanSafe(goal, n);
      if (btn) { btn.textContent = 'AI 生成弧线'; btn.disabled = false; }
      if (r.ok) renderBody();
      else if (out) out.textContent = '生成失败：' + r.reason + (r.reason === 'judge-not-configured' ? '（面板「连接」页配置 judge 通道）' : '');
    });
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
        const ghosts = (WA.settingsBus && WA.settingsBus.ghostScan) ? WA.settingsBus.ghostScan() : { keys: [], total: 0, bytes: 0 };
        const plan = WA.store.sweepStaleKeys({});   // dry-run（v2.5.0 起未登记设置键默认保留，与旧版行为一致）
        let html = '<div class="wa-item"><b>存储键体检</b>：worldaxis_* 键 ' + st.totalKeys + ' 个 / ' + Math.round(st.totalBytes / 1024) + 'KB（存档 ' + st.families.state + ' · 派生槽 ' + (st.families.stateDerived || 0) + ' · 恢复点 ' + st.families.recovery + ' · 诊断 ' + st.families.diagnostic + ' · 隔离 ' + st.families.corrupt + ' · 设置 ' + st.families.settings + ' · 未登记设置 ' + (st.families.settingsUnregistered || 0) + ' · 世界书 ' + st.families.wb + '）</div>';
        if (st.currentChatQuarantines > 0) html += '<div class="wa-dim">当前聊天隔离副本 ' + st.currentChatQuarantines + ' 个（受保护不自动清理——损坏时的原始现场，确认无需回滚后可手动删除）</div>';
        if (WA.settingsBus && WA.settingsBus.stats && WA.settingsBus.stats.quarantines > 0) html += '<div class="wa-dim">settingsBus：迁移 ' + WA.settingsBus.stats.upgrades + ' 次 · 损坏隔离累计 ' + WA.settingsBus.stats.quarantines + ' 次（隔离键保留最近 5 个）</div>';
        // v2.5.0: 未登记设置键（幽灵设置）——登记表管不到它（没登记）、清理规则也管不到它（被当用户数据保护），
        //   此前在面板与诊断里都没有出口（实证案例 worldaxis_director_tags_v1：v0.1.0 写入、v0.2.0 功能移除后永久滞留）。
        //   处置口径：**默认保留**，必须由用户显式选择才进清理计划——"永不清理"与"无人可清理"是两回事。
        if (ghosts.total) {
          html += '<div class="wa-log wa-log-warn">未登记设置键 ' + ghosts.total + ' 个 / ' + Math.round(ghosts.bytes / 1024 * 10) / 10 + 'KB（扩展不认识、登记表未覆盖，因此既不会被自动清理也不会被自动迁移）</div>';
          html += '<div class="wa-dim">' + ghosts.keys.slice(0, 6).map(g => esc(g.key) + ' <span class="wa-dim">' + g.bytes + 'B · ' + g.shape + '</span>').join('<br>') + (ghosts.keys.length > 6 ? '<br>…等 ' + ghosts.keys.length + ' 项' : '') + '</div>';
        }
        const sweepGo = (withGhost) => { try { const done = WA.store.sweepStaleKeys({ apply: true, ghostSettings: withGhost }); $('#wa-diag-out').innerHTML = '<div class="wa-log wa-log-info">✓ 已清理 ' + done.remove.length + ' 个键，释放 ' + Math.round(done.freedBytes / 1024) + 'KB（当前聊天与在册设置键未动' + (withGhost ? '；已含未登记设置键）' : '）') + '</div>'; } catch (e) { $('#wa-diag-out').textContent = '清理失败：' + (e && e.message); } };
        if (!plan.remove.length && !ghosts.total) { html += '<div class="wa-log wa-log-info">✓ 无过期键可清理（当前聊天 / 设置 / 世界书键受保护）</div>'; out.innerHTML = html; return; }
        if (plan.remove.length) {
          html += '<div class="wa-log wa-log-warn">可回收 ' + plan.remove.length + ' 个过期键 / ' + Math.round(plan.freedBytes / 1024) + 'KB：过期诊断 ' + (plan.byFamily['diag-idle'] || 0) + ' · 隔离溢出 ' + (plan.byFamily['corrupt-overflow'] || 0) + ' · 孤儿恢复点 ' + (plan.byFamily['orphan-recovery'] || 0) + '</div>';
          html += '<div class="wa-dim">' + plan.remove.slice(0, 8).map(r => esc(r.key)).join('<br>') + (plan.remove.length > 8 ? '<br>…等 ' + plan.remove.length + ' 项' : '') + '</div>';
        } else {
          html += '<div class="wa-log wa-log-info">✓ 无过期键可回收（未登记设置键不在自动计划内）</div>';
        }
        html += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-key-sweep-go">确认清理（不可撤销）</button>';
        if (ghosts.total) html += '<button class="wa-btn wa-mini" id="wa-key-sweep-ghost">清理并包含未登记设置键（' + ghosts.total + '）</button>';
        html += '</div>';
        out.innerHTML = html;
        const go = $('#wa-key-sweep-go'); if (go) go.onclick = () => sweepGo(false);
        const goG = $('#wa-key-sweep-ghost'); if (goG) goG.onclick = () => sweepGo(true);
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
        a.href = url; a.download = 'worldaxis-recovery-' + clockWall() + '.json';
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
        // v0.6.0: 容量治理信号透出——超限/未登记容器计数（D 块 maintain 信号 → 面板可见）
        const sg = m.signals || {};
        if ((sg.capacityDrifted || 0) > 0 || (sg.capacityUnregistered || 0) > 0) {
          html += '<div class="wa-log wa-log-warn">容量：超限容器 ' + (sg.capacityDrifted || 0) + ' 个 · 未登记容器 ' + (sg.capacityUnregistered || 0) + ' 个（建议执行 trim-containers 或补登记）</div>';
        }
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
          a.href = url; a.download = 'worldaxis-conflict-' + clockWall() + '.json';
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
    // v0.7.0: 结算守卫——查看归因计数 + 强制下一轮结算（escape hatch）
    const sgBtn = $('#wa-settle-view');
    if (sgBtn) sgBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.settleGuard) return;
      try {
        const st = WA.settleGuard.stat();
        const ls = st.lastSettle;
        let html = '<div class="wa-log wa-log-info">结算守卫：已结算 ' + st.settles + ' 轮 · 跳过（重复 ' + st.skips.dup + ' / 重掷 ' + st.skips.reroll + ' / 回退 ' + st.skips.rewind + '）'
          + (st.forced ? ' · 强制 ' + st.forced : '')
          + (ls ? '<br>最后结算：楼层 ' + ls.floor + ' · 第 ' + ls.round + ' 轮 · ' + new Date(ls.at).toLocaleString() : '')
          + '<br>语义：同一楼层至多结算一次（swipe/重掷/重复通知不再虚增世界时间）</div>';
        html += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-settle-force">强制下一轮结算</button></div>';
        // v2.2.0: 待生效标记可见 + 可取消——此前 forceNext 后从界面无从得知标记已挂上，
        // 也没有撤销出口（settleGuard.reset 定义以来全库零调用）。
        if (WA.settleGuard.peekForce && WA.settleGuard.peekForce() === true) {
          html += '<div class="wa-log wa-log-warn">⚠ 当前有未生效的强制结算标记（下一次回复将无视楼层守卫推进世界）</div>'
            + '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-settle-unforce">取消该标记</button></div>';
        }
        out.innerHTML = html;
        const fb = $('#wa-settle-force');
        if (fb) fb.onclick = () => {
          WA.settleGuard.forceNext();
          out.innerHTML = '<div class="wa-log wa-log-warn">✓ 已请求强制结算：下一次回复完成时将无视楼层守卫推进世界（用于删改消息后重对齐）</div>';
        };
        const uf = $('#wa-settle-unforce');
        if (uf) uf.onclick = () => {
          WA.settleGuard.reset();
          out.innerHTML = '<div class="wa-log wa-log-info">✓ 已取消强制标记：下一次回复恢复常规楼层守卫判定（重复/重掷/回退仍会被跳过）</div>';
        };
      } catch (e) { out.textContent = '结算守卫读取失败：' + (e && e.message); }
    };
    // v2.2.0: 计量清零出口——resetTxStat / resetCallStats 此前定义了却没有入口（计数只增不减，
    // 长会话里 avgMs 与错误率被历史样本稀释，用户无从重新取样）。
    const srBtn = $('#wa-stat-reset');
    if (srBtn) srBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const done = [];
        if (WA.store && WA.store.resetTxStat) { WA.store.resetTxStat(); done.push('事务计量'); }
        if (WA.apiRouter && WA.apiRouter.resetCallStats) { WA.apiRouter.resetCallStats(); done.push('通道调用台账'); }
        out.innerHTML = '<div class="wa-log wa-log-info">✓ 已清零 ' + (done.join(' / ') || '（无可清零项）')
          + '——只重置计数器，世界状态与存档未受影响</div>';
      } catch (e) { out.textContent = '清零失败：' + (e && e.message); }
    };
    // v2.2.0: 宿主兼容层出口——compatMvu.status / compatTH.status 此前零消费
    const cvBtn = $('#wa-compat-view');
    if (cvBtn) cvBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        let html = '<div class="wa-sec">宿主兼容层</div>';
        const m = (WA.compatMvu && WA.compatMvu.status) ? WA.compatMvu.status() : null;
        if (m) {
          html += '<div class="wa-item"><b>MVU 变量镜像</b>：' + (m.active ? '<span class="wa-badge wa-on">已激活</span>' : '<span class="wa-badge">未激活</span>')
            + '<br><span class="wa-dim">原因 ' + esc(m.lastReason || '未知') + ' · 同步 ' + m.syncCount + ' 次'
            + (m.lastSyncAt ? ' · 最近 ' + new Date(m.lastSyncAt).toLocaleTimeString() : '') + '</span></div>';
        } else html += '<div class="wa-item">MVU：模块不可用</div>';
        const t = (WA.compatTH && WA.compatTH.status) ? WA.compatTH.status() : null;
        if (t) {
          html += '<div class="wa-item"><b>TH 沙箱桥接</b>：' + (t.active ? '<span class="wa-badge wa-on">已暴露</span>' : '<span class="wa-badge">未暴露</span>')
            + '<br><span class="wa-dim">原因 ' + esc(t.lastReason || '未知') + ' · 当前' + (t.isTH ? '在' : '不在') + ' TH 沙箱'
            + (t.exposedAt ? ' · 暴露于 ' + new Date(t.exposedAt).toLocaleTimeString() : '') + '</span></div>';
        } else html += '<div class="wa-item">TH：模块不可用</div>';
        html += '<div class="wa-dim">未激活不等于故障：MVU 需宿主开启变量框架，TH 桥仅在脚本沙箱内暴露。真正的异常（reason 以 error: 开头）会被健康巡视记为 engine.compat。</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '兼容层读取失败：' + (e && e.message); }
    };
    // v2.2.0: 运行痕迹清空出口——resetStats / resetHistory 此前无面板入口（画像只能越积越旧）
    const wfrBtn = $('#wa-wf-reset');
    if (wfrBtn) wfrBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const before = (WA.workflow && WA.workflow.stats) ? WA.workflow.stats(999).tracked : 0;
        if (WA.workflow && WA.workflow.resetStats) WA.workflow.resetStats();
        if (WA.workflow && WA.workflow.resetHistory) WA.workflow.resetHistory();
        out.innerHTML = '<div class="wa-log wa-log-info">✓ 已清空工作流节点画像与运行历史（此前跟踪 ' + before + ' 个节点）：下一轮运行将重新取样，失败台账同时清零</div>';
      } catch (e) { out.textContent = '清空失败：' + (e && e.message); }
    };
    // v2.2.0: 存档恢复点出口——store.restore / dropRecoveryPoint 此前全库零调用：
    //   恢复点只能导出成 JSON 文件，无法回滚；环形窗口仅 3 个却无法手动腾位。
    const rvBtn = $('#wa-recovery-view');
    if (rvBtn) rvBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.store) return;
      try {
        const list = WA.store.listRecoveryPoints();
        const st = WA.store.recoveryStat();
        let html = '<div class="wa-item"><b>存档恢复点</b>：' + st.count + '/' + st.max + ' · ' + Math.round(st.bytes / 1024) + 'KB'
          + (st.multiInstance ? ' · 跨 ' + st.writers + ' 个窗口留点' : '') + '</div>';
        html += '<div class="wa-dim">升级/恢复/回滚前自动留点（环形窗口 ' + st.max + ' 个，满了挤掉最旧）。「恢复到此点」会把世界状态整体回滚，执行前会自动再留一个当前点，防二次丢失。</div>';
        if (!list.length) { out.innerHTML = html + '<div class="wa-log wa-log-info">当前聊天暂无恢复点（首次升级或首次回滚时创建）</div>'; return; }
        html += list.map((p, i) => '<div class="wa-item">' + new Date(p.at).toLocaleString()
          + ' · rev ' + (p.rev || 0) + (p.by ? ' · 实例 ' + esc(String(p.by).slice(0, 10)) : '')
          + '<div class="wa-row"><button class="wa-btn wa-mini" data-rv-restore="' + i + '">恢复到此点</button>'
          + '<button class="wa-btn wa-mini" data-rv-drop="' + i + '">丢弃</button></div></div>').join('');
        out.innerHTML = html;
        out.querySelectorAll('[data-rv-restore]').forEach(function (b) {
          b.onclick = () => {
            const i = +b.dataset.rvRestore;
            const p = list[i]; if (!p) return;
            // 破坏性操作：二次确认，不一步执行（与「存储键体检」的确认清理同规格）
            out.innerHTML = '<div class="wa-log wa-log-warn">⚠ 即将把世界状态回滚到 ' + new Date(p.at).toLocaleString()
              + '：当前进度将被替换（会先自动留一个当前点，可再滚回来）</div>'
              + '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-rv-confirm">确认回滚</button><button class="wa-btn wa-mini" id="wa-rv-cancel">取消</button></div>';
            const cf = $('#wa-rv-confirm');
            if (cf) cf.onclick = () => {
              const okv = WA.store.restore(i);
              // 先重绘再写反馈：renderBody 会重建 .wa-body，先写会被冲掉（用户点完看不到结果）
              if (okv) renderBody();
              const o2 = $('#wa-diag-out');
              if (o2) o2.innerHTML = '<div class="wa-log wa-log-' + (okv ? 'info' : 'err') + '">' + (okv ? '✓ 已回滚到该恢复点（世界状态已替换，可到「世界」页核对）' : '✗ 回滚失败（该点可能已被挤出环形窗口）') + '</div>';
            };
            const cc = $('#wa-rv-cancel');
            if (cc) cc.onclick = () => { if (rvBtn.onclick) rvBtn.onclick(); };
          };
        });
        out.querySelectorAll('[data-rv-drop]').forEach(function (b) {
          b.onclick = () => {
            const r = WA.store.dropRecoveryPoint(undefined, +b.dataset.rvDrop);
            if (r.ok) renderBody();
            const o2 = $('#wa-diag-out');
            if (o2) o2.innerHTML = '<div class="wa-log wa-log-' + (r.ok ? 'info' : 'err') + '">' + (r.ok ? '✓ 已丢弃 1 个恢复点（剩 ' + r.remaining + ' 个）' : '✗ 丢弃失败：' + esc(r.reason)) + '</div>';
          };
        });
      } catch (e) { out.textContent = '恢复点读取失败：' + (e && e.message); }
    };
    // v2.2.0: 设置键登记表 / 孤儿清理——settingsBus.registry/pendingOrphan 此前零消费
    //   （注释承诺「面板一键移除注册」，但注销 API 根本不存在，本块补齐）
    const orphBtn = $('#wa-orphan-view');
    if (orphBtn) orphBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.store) return;
      try {
        const regStat = (WA.settingsBus && WA.settingsBus.registryStat) ? WA.settingsBus.registryStat() : null;
        const orphans = WA.store.orphanSettingsKeys ? (WA.store.orphanSettingsKeys() || []) : [];
        // v2.5.0: 键生命周期视图——「有几个键声明了结构迁移/原始格式复活」「本会话迁移了几个」。
        //   此前这些能力在面板完全没有出口（migrate 字段零调用、rawRevive 根本不存在都看不出来）。
        const life = (WA.settingsBus && WA.settingsBus.selfCheck) ? (WA.settingsBus.selfCheck().lifecycle || null) : null;
        const migSt = (WA.settingsBus && WA.settingsBus.migrationStat) ? WA.settingsBus.migrationStat() : null;
        const ghostN = (WA.settingsBus && WA.settingsBus.ghostScan) ? WA.settingsBus.ghostScan() : null;
        // v2.6.0: 写入侧台账——读侧早有计量，写侧此前在面板上完全不可见。
        //   用户「点了保存却没生效」时，这里是唯一能当场区分「写失败」与「没调用」的地方。
        const wSt = (WA.settingsBus && WA.settingsBus.writeStat) ? WA.settingsBus.writeStat() : null;
        let html = '<div class="wa-item"><b>设置键登记表</b>：' + (regStat ? regStat.total : '?') + ' 项（带 legacy 旧键 ' + (regStat ? regStat.legacy : 0) + ' · 孤儿 ' + orphans.length + '）</div>';
        if (wSt) {
          // v2.6.0（收口）: 措辞必须与判定的**依据面**一致。本计量在收口后覆盖全部写路径
          //   （保存 / 迁移回写 / 结构指纹 / 旧键迁移 / 格式复活 / 损坏隔离副本），故不再只说
          //   「保存未落盘」——那会让「迁移回写失败」这类故障被读成「你没点保存」。
          const WS_LABEL = { missingKey: '登记项缺key(实现缺陷)', stringify: '值不可序列化(实现缺陷)',
            setItem: '写盘被拒', writeback: '迁移回写', rawRevive: '格式复活',
            quarantine: '隔离副本', legacy: '旧键迁移', stamp: '结构指纹' };
          const wBy2 = wSt.bySource || {};
          const wSrcTxt = Object.keys(wBy2).filter(function (k) { return wBy2[k] > 0; })
            .map(function (k) { return (WS_LABEL[k] || k) + '×' + wBy2[k]; }).join('、');
          const wCodeBug = (wBy2.missingKey || 0) + (wBy2.stringify || 0) > 0;
          if (wSt.writeFailed > 0) {
            html += '<div class="wa-log wa-log-' + (wSt.lastError ? 'err' : 'warn') + '">写入侧：' + wSt.writeFailed + ' 次写盘失败、' + wSt.writes + ' 次成功'
              + (wSrcTxt ? '（来源：' + esc(wSrcTxt) + '）' : '')
              + (wSt.lastError ? '——最近原因 ' + esc(wSt.lastError) : '（此后已有成功写入覆盖）')
              + (wCodeBug ? '。含实现缺陷项（登记项缺 key / 值不可序列化），清存储无效，须改调用方。</div>'
                          : '。配额已满/隐私模式/键被拒绝时写盘会失败，用户改动可能静默丢失，请先导出诊断包留证。</div>') ;
          } else {
            html += '<div class="wa-dim">写入侧：' + wSt.writes + ' 次写盘全部落盘' + (wSt.last ? '（最近 ' + esc(wSt.last.key) + ' ' + wSt.last.bytes + 'B）' : '') + '。</div>';
          }
          // v2.7.0: 「写盘被拒」之外还要说「写进去没留住」——两者都是失败，但下一步动作不同：
          //   前者清空间/关隐私模式，后者重试无用、只能留证（存储层静默截断）。
          if (wSt.verifyFailed > 0) {
            const stg = wSt.staged || {};
            html += '<div class="wa-log wa-log-err">写入侧另有 ' + wSt.verifyFailed + ' 次**写完读回不一致**'
              + (stg.key ? '（最近 ' + esc(stg.key) + '：' + esc(stg.reason || '') + '）' : '')
              + '：setItem 没报错，但磁盘上的不是刚写的值（移动端配额临界/写入毒化会静默发生）。重试无效，请先导出配置与诊断包留证。</div>';
          }
          if (wSt.subkeyDrift && wSt.subkeyDrift.count > 0) {
            const lp = wSt.subkeyDrift.last || {};
            html += '<div class="wa-log wa-log-warn">写入侧出现 ' + wSt.subkeyDrift.count + ' 个声明之外的子键' + (lp.key ? '（最近 ' + esc(lp.key) + '）' : '') + '：属调用点未收口，非老存档遗留。</div>';
          }
        }
        // v2.9.0: 删除侧——写入侧自 v2.6.0/v2.7.0 起有三行口径（落盘/写回不一致/子键漂移），
        //   删除侧此前**一行都没有**。删除是破坏性操作，它不可观测比写入不可观测更危险：
        //   「已清理 N 项」可能是假的，而用户会据此认为空间已腾出。
        const rmSt = (WA.settingsBus && typeof WA.settingsBus.removeStat === 'function') ? WA.settingsBus.removeStat() : null;
        if (rmSt) {
          // v2.9.0（当前态口径）: 判据取自「最近一次删除的结果」（rmRemove 每次调用先清零），
          //   与 maintain / tool-diag 同裁决；累计数只作括注展示。
          //   否则用户把存储修好后，面板仍会永久置红——面板的作用是描述**现在**。
          if (rmSt.lastRemoveStaged) {
            const stgR = rmSt.lastRemoveStaged || {};
            html += '<div class="wa-log wa-log-err">删除侧：最近一次删除**删完读回仍在**'
              + (stgR.key ? '（' + esc(stgR.key) + '）' : '')
              + '：removeItem 没报错但键还在磁盘上——清理报出的「已释放」与实际不符，请勿据此判断空间已腾出。此类失败重试无效，请先导出诊断包留证。'
              + (rmSt.removeStaged > 1 ? '（本会话累计 ' + rmSt.removeStaged + ' 次）' : '') + '</div>';
          } else if (rmSt.lastRemoveError) {
            const byR = rmSt.removeFailedBy || {};
            const rSrcTxt = Object.keys(byR).filter(function (k) { return byR[k] > 0; })
              .map(function (k) { return ({ guarded: '删完仍在', missing: '登记项缺 key', setItem: '删除被拒', quarantine: '隔离路径', legacy: '旧键迁移', settings: '设置键出口' }[k] || k) + '×' + byR[k]; }).join('、');
            html += '<div class="wa-log wa-log-warn">删除侧：最近一次删除未成功（' + esc(String(rmSt.lastRemoveError)) + '）'
              + '；本会话累计 ' + rmSt.removeFailed + ' 次未成功、' + rmSt.removes + ' 次成功'
              + (rSrcTxt ? '（来源：' + esc(rSrcTxt) + '）' : '')
              + '。删除失败时相关键仍占据磁盘空间。</div>';
          } else if (rmSt.removes > 0) {
            html += '<div class="wa-dim">删除侧：' + rmSt.removes + ' 次受控删除全部复核通过（键确已移除）' + (rmSt.lastRemove ? '（最近 ' + esc(rmSt.lastRemove.key) + '）' : '') + '。</div>';
          }
        }
        // v2.10.0: 读侧——写入侧自 v2.6.0 有三行（落盘/写回不一致/子键漂移），删除侧自 v2.9.0
        //   有两行，**读侧一行都没有**。而读侧失真是唯一会被用户当成「设置被程序改回去了」
        //   的故障：他看到的「配置」其实是兜底的默认值，与「从未配置」在界面上完全一样。
        const rdSt = (WA.settingsBus && typeof WA.settingsBus.readStat === 'function') ? WA.settingsBus.readStat() : null;
        if (rdSt) {
          if (rdSt.defaultAfterFailure > 0) {
            const lf = rdSt.lastFail || {};
            html += '<div class="wa-log wa-log-err">读取侧：' + rdSt.defaultAfterFailure + ' 次读取**没读到用户配置、回落了默认值**'
              + (lf.tag ? '（最近来源：' + esc(lf.tag) + '）' : '')
              + '——界面上显示的设置并不是你配的那个，而它看起来与「从未配置」完全一样。若是隐私模式/存储被拒，请先导出诊断包留证。</div>';
          } else if (rdSt.readFailed > 0) {
            const byRd = rdSt.bySource || {};
            const rdSrcTxt = Object.keys(byRd).filter(function (k) { return byRd[k] > 0; })
              .map(function (k) { return ({ read: '存储层读取', parse: '值解析', migrate: '迁移', copy: '返回值拷贝' }[k] || k) + '×' + byRd[k]; }).join('、');
            html += '<div class="wa-log wa-log-warn">读取侧：' + rdSt.readFailed + ' 次读取未命中用户配置'
              + (rdSrcTxt ? '（来源：' + esc(rdSrcTxt) + '）' : '')
              + (rdSt.lastError ? '，最近：' + esc(String(rdSt.lastError).slice(0, 80)) : '') + '。</div>';
          } else if (rdSt.reads > 0) {
            html += '<div class="wa-dim">读取侧：' + rdSt.reads + ' 次设置读取全部命中磁盘'
              + (rdSt.last && rdSt.last.key ? '（最近 ' + esc(rdSt.last.key) + '，来源 ' + esc(rdSt.last.source || 'disk') + '）' : '') + '。</div>';
          }
        }
        // v2.11.0（面B 消费端）: 结构指纹陈旧——warn 级用「本会话经历过」（累计口径，
        //   与 readFailed 同规格）；它已被重盖动作自愈，故只提示、不阻断。
        //   用户视角的解释是「这条配置是旧版本的结构，引擎已按新结构重盖」；为什么值得一行：
        //   缩减型结构变更会让旧子键被写回，而界面上看不出任何异常（显示的是兜底值）。
        if (rdSt && rdSt.schema && rdSt.schema.lastStale) {
          const lsP = rdSt.schema.lastStale;
          html += '<div class="wa-log wa-log-warn">结构指纹：设置键 ' + esc(String(lsP.key || '?'))
            + ' 的磁盘结构来自旧版本（本会话累计 ' + String((rdSt.schema.status || {}).stale || 1)
            + ' 次；指纹不符，已按当前结构重盖）'
            + (lsP.prevAt ? '（旧结构写入于 ' + esc(new Date(lsP.prevAt).toLocaleString()) + '）' : '')
            + '。若该结构变更是「删过子键」型，旧子键可能被原样写回，可在诊断包里核对。</div>';
        }
        // v2.11.0（R3 自纠）: 结构读不出来（error 级）——与「从未配置」分开说，
        //   因为用户要做的事完全不同（导出诊断包留证 + 重建该键 vs 无需处理）。
        if (rdSt && rdSt.schema && rdSt.schema.status && rdSt.schema.status.unreadable > 0) {
          html += '<div class="wa-log wa-log-err">结构指纹：有 ' + rdSt.schema.status.unreadable
            + ' 次读取遇到**磁盘上有值但读不出结构**——损坏值已隔离留证并回落默认值，'
            + '这些键当前的配置不是您配的那一份。请先导出诊断包留证，再决定是否重建该键。</div>';
        }
        if (rdSt && rdSt.schema && rdSt.schema.status && rdSt.schema.status.failed > 0) {
          html += '<div class="wa-log wa-log-warn">结构指纹：写入失败 ' + rdSt.schema.status.failed
            + ' 次——「这份值属于哪个结构版本」在磁盘上不可查，后续结构变更将无法判定新旧形状。</div>';
        }
        // v2.10.0: store 域读侧——两个域各有独立裸读点，只展示一处会让另一半的
        //   「容量表偏小 / 误判最冷」继续对用户不可见（与删除侧两域都报同一理由）。
        const rdStore2 = (WA.store && typeof WA.store.readStat === 'function') ? (function () { try { return WA.store.readStat(); } catch (e) { return null; } })() : null;
        if (rdStore2 && !rdStore2.ok) {
          // v2.11.0: 结论级读失败单列（error 级）——与 store.maintain / tool-diag 三处同判据。
          //   容量数字失真只是「算不准」，这几种是「结论本身不成立」：存档没载入却照常运行、
          //   并发覆盖没保住对方、巡检结论建立在失败读取上。用户必须能在面板上直接看到。
          const lfSrcP = (rdStore2.lastFail && rdStore2.lastFail.source) || null;
          if (lfSrcP === 'load') {
            html += '<div class="wa-log wa-log-err">读取侧（存储域）：最近一次读取失败发生在**存档载入**上'
              + '——当前聊天整份存档对本实例不可见，界面呈现的是默认世界而磁盘上仍有你的进度。'
              + '<b>此时不要保存</b>：任何保存都会用空状态覆盖真档。请先导出诊断包留证。</div>';
          }
          if (lfSrcP === 'saveConflict') {
            html += '<div class="wa-log wa-log-err">读取侧（存储域）：最近一次读取失败发生在**并发覆盖前的保全读回**上'
              + '——已确认另一实例写过该聊天、本次保存将覆盖其改动，而对方内容读不出来，'
              + '<b>本次覆盖未能保全对方进度</b>（他实例的改动已被静默吞掉，无现场可查）。</div>';
          }
          if (lfSrcP === 'verifyState') {
            html += '<div class="wa-log wa-log-err">读取侧（存储域）：最近一次读取失败发生在**存档巡检**上'
              + '——「所有聊天存档可解析」这个结论建立在一次失败的读取之上，该聊天既没被判定正常、也没被判定损坏。</div>';
          }
          if (lfSrcP === 'chatcacheInstallBack') {
            html += '<div class="wa-log wa-log-warn">读取侧（存储域）：最近一次读取失败发生在**快照安装回读**上'
              + '——安装后无法确认磁盘内容与安装值一致（静默截断与读失败在本会话内不可分辨）。</div>';
          }
          // v2.10.0（逆向审计自纠第四轮）: 恢复点保护失效单独一行（error 级）——「读不到就不写」
          //   虽然保住了历史恢复点，但用户此刻没有恢复点保护，必须比容量数字失真更醒目。
          if (rdStore2.bySource && rdStore2.bySource.recovery > 0) {
            html += '<div class="wa-log wa-log-err">读取侧（存储域）：恢复点清单读取失败 ' + rdStore2.bySource.recovery
              + ' 次——恢复点创建已被跳过（读不到就不写，避免覆盖丢弃历史恢复点），当前**没有恢复点保护**</div>';
          }
          // v2.11.0: 来源明细**全量列出**（此前只列三个已知桶 ⇒ 本版新增的 20 余个来源
          //   在面板上「有归因但看不见」，与 v2.10.0 修掉的同型缺陷）。
          const LAB_P = { bytes: '按字节', activity: '活跃时间', enumerate: '枚举', diskRev: '磁盘序号',
            verify: '写后/删后复核读回', recovery: '恢复点清单', conflict: '冲突现场',
            quarantine: '隔离现场', writerId: '写入者标识',
            load: '存档载入', saveConflict: '并发覆盖前保全', verifyState: '存档巡检',
            rmExisted: '删除前探测', verifyBack: '复核读回', legacyRead: '旧键读取',
            saveInherit: '指纹继承', subkeyAudit: '子键盘点', pendingOrphan: '幽灵盘点',
            verifyDefaults: '默认值校验', lsRaw: '幽灵原文', chatcacheState: '聊天快照',
            chatcacheRev: '同步序号', chatcacheInstallBack: '安装回读',
            worldbookSelection: '世界书选择', workflowHistory: '工作流历史',
            uninjectLedger: '撤销账本', eventLog: '事件日志', errorLog: '错误日志' };
          const byP = rdStore2.bySource || {};
          const srcTxtP = Object.keys(byP).filter(function (k) { return byP[k] > 0; })
            .map(function (k) { return (LAB_P[k] || k) + ' ' + byP[k]; }).join(' / ');
          html += '<div class="wa-log wa-log-warn">读取侧（存储域）：' + rdStore2.readFailed + ' 次读取失败（'
            + srcTxtP + '）——读失败的键被按 0 字节计，占用统计偏小；活跃时间读失败会被判为「最冷」而进入可回收候选。</div>';
        }
        // v2.9.0: store 侧受控删除台账——此前 store.removeStat() 零产品消费（纯声明面）。
        //   两个域各有独立的裸删点（settings-bus 管设置键、store 管冲突现场/隔离/诊断键），
        //   只展示一处会让另一半的「清理了却没清掉」继续对用户不可见。
        const rmStore = (WA.store && typeof WA.store.removeStat === 'function') ? (function () { try { return WA.store.removeStat(); } catch (e) { return null; } })() : null;
        if (rmStore && rmStore.lastReason === 'staged-still-present') {
          html += '<div class="wa-log wa-log-err">删除侧（存储域）：最近一次删除**删完读回仍在**'
            + (rmStore.lastKey ? '（' + esc(String(rmStore.lastKey)) + '）' : '')
            + '：键没被真正移除（本会话累计 ' + rmStore.staged + ' 次）。清理类操作报出的「已释放」不可信。</div>';
        } else if (rmStore && rmStore.lastReason) {
          html += '<div class="wa-log wa-log-warn">删除侧（存储域）：最近一次删除未成功（' + esc(String(rmStore.lastReason)) + '）'
            + '；本会话累计 ' + rmStore.failed + ' 次未成功、' + rmStore.removed + ' 次成功。</div>';
        } else if (rmStore && rmStore.removed > 0) {
          html += '<div class="wa-dim">删除侧（存储域）：' + rmStore.removed + ' 次受控删除均复核通过（键确已移除）。</div>';
        }
        html += '<div class="wa-dim">登记表＝扩展认识的 worldaxis_* 设置键清单（含旧键迁移规则）。孤儿＝模块已声明废弃（orphan）且键已不在磁盘上的幽灵登记，注销只影响登记表，不动任何在用配置。</div>';
        if (life) {
          html += '<div class="wa-dim">生命周期声明：结构迁移 ' + life.migrate + ' 个键 · 原始格式复活 ' + life.rawRevive + ' 个键 · legacy 旧键 ' + life.legacy + ' 个。'
            + (migSt && migSt.ok > 0 ? '本会话已迁移 ' + migSt.ok + ' 个（最近 ' + esc((migSt.last || {}).key || '?') + '）' : '本会话尚无结构迁移发生')
            + (migSt && migSt.failed > 0 ? '；<b>迁移失败 ' + migSt.failed + ' 个</b>（' + esc((migSt.failedKeys || []).join('、')) + '）——这些键按原值继续被消费' : '') + '</div>';
          if (life.migrate === 0 && life.rawRevive === 0) {
            html += '<div class="wa-log wa-log-warn">全部登记项都未声明生命周期钩子：本插件结构仍在演化，无键声明升级路径意味着缺声明或能力再次空转</div>';
          }
        }
        if (ghostN && ghostN.total > 0) {
          html += '<div class="wa-log wa-log-warn">另有 ' + ghostN.total + ' 个未登记设置键（扩展不认识、登记表未覆盖）：' + ghostN.keys.slice(0, 4).map(function (g) { return esc(g.key) + '(' + g.bytes + 'B)'; }).join('、') + '——处置入口在「存储键体检」</div>';
        }
        if (regStat && regStat.byModule) {
          html += '<div class="wa-dim">按模块：' + Object.keys(regStat.byModule).map(function (k) { return esc(k) + '(' + regStat.byModule[k] + ')'; }).join(' · ') + '</div>';
        }
        if (!orphans.length) { out.innerHTML = html + '<div class="wa-log wa-log-info">✓ 无孤儿设置键（登记表与实际磁盘一致）</div>'; return; }
        html += orphans.map(function (o) {
          return '<div class="wa-item">' + esc(o.key) + ' <span class="wa-dim">' + esc(o.module || '') + '</span>'
            + '<div class="wa-row"><button class="wa-btn wa-mini" data-orph-del="' + esc(o.key) + '">注销登记</button></div></div>';
        }).join('');
        html += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-orph-all">全部注销（' + orphans.length + '）</button></div>';
        out.innerHTML = html;
        const doOne = function (key) {
          const r = WA.settingsBus.deregisterOrphan(key);
          if (r.ok && orphBtn.onclick) orphBtn.onclick();   // 先重绘列表，再写反馈（防被冲掉）
          const o2 = $('#wa-diag-out');
          if (o2) o2.innerHTML = '<div class="wa-log wa-log-' + (r.ok ? 'info' : 'err') + '">' + (r.ok ? '✓ 已注销孤儿登记 ' + esc(key) : '✗ 注销失败：' + esc(r.reason)) + '</div>';
        };
        out.querySelectorAll('[data-orph-del]').forEach(function (b) { b.onclick = () => doOne(b.dataset.orphDel); });
        const allBtn = $('#wa-orph-all');
        if (allBtn) allBtn.onclick = () => {
          let done = 0;
          orphans.forEach(function (o) { if (WA.settingsBus.deregisterOrphan(o.key).ok) done++; });
          if (orphBtn.onclick) orphBtn.onclick();   // 先重绘，再写反馈
          const o2 = $('#wa-diag-out');
          if (o2) o2.innerHTML = '<div class="wa-log wa-log-info">✓ 已注销 ' + done + '/' + orphans.length + ' 个孤儿登记</div>';
        };
      } catch (e) { out.textContent = '设置键读取失败：' + (e && e.message); }
    };
    const conc = $('#wa-conc'); if (conc) conc.oninput = () => { WA.apiRouter.setConcurrency(+conc.value); $('#wa-conc-v').textContent = conc.value; };
    // 设置页绑定
    if (currentPage === 'settings' && WA.uiSettings) WA.uiSettings.bind(panelEl);
    // 助手页绑定
    const askBtn = $('#wa-ask-btn');
    if (askBtn) askBtn.onclick = async () => { const q = $('#wa-ask-input').value.trim(); if (!q) return; const out = $('#wa-ask-out'); out.textContent = '思考中…'; const r = await WA.assistant.ask(q); out.textContent = r.ok ? r.text : ('失败：' + r.reason); };
    let thLast = null;   // v2.2.0: 最近一次剧场产物（供「插入输入框」使用）
    const thBtn = $('#wa-theater-btn');
    if (thBtn) thBtn.onclick = async () => {
      const out = $('#wa-theater-out'); out.textContent = '剧场编排中…';
      const r = await WA.theater.generate($('#wa-theater-input').value.trim());
      thLast = r.ok ? r.text : null;
      out.textContent = r.ok ? r.text : ('失败：' + (r.reason || (r.error && r.error.message)));
      const ib = $('#wa-theater-insert'); if (ib) ib.disabled = !r.ok;
    };
    // v2.2.0: 把产物送进输入框（此前 wrap 零调用，产物只能停在面板里 → 功能死路）
    const thIns = $('#wa-theater-insert');
    if (thIns) thIns.onclick = () => {
      const out = $('#wa-theater-out');
      if (!thLast) { out.textContent = '请先生成番外'; return; }
      const r = WA.theater.send(thLast, { title: currentPage === 'assistant' ? '番外小剧场' : '番外' });
      out.textContent = r.ok ? '✓ 已插入输入框（' + r.length + ' 字符），可在发送前编辑' : ('插入失败：' + r.reason + '（可点「复制」手动粘贴）');
    };
    const thCopy = $('#wa-theater-copy');
    if (thCopy) thCopy.onclick = () => {
      const out = $('#wa-theater-out');
      if (!thLast) { out.textContent = '请先生成番外'; return; }
      const block = WA.theater.wrap('番外小剧场', thLast);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(block); out.textContent = '✓ 已复制到剪贴板'; }
        else out.textContent = block;
      } catch (e) { out.textContent = block; }
    };
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

  // ── v2.1.0: 状态变更 → 面板自动重绘 ──────────────────────
  //   这 9 个事件此前「只广播无接收」：世界钟自动推进、章节起止、NPC 登记、弧线生成、
  //   突发事件起止、通道改配置、切聊天、背景设置变更，开着面板都不刷新（要手动切页）。
  const __rerStat = { scheduled: 0, ran: 0, skippedHidden: 0, skippedTyping: 0, failed: 0, lastWhy: null };
  let __rerenderTimer = null;
  function scheduleRerender(why) {
    __rerStat.scheduled++; __rerStat.lastWhy = why || null;
    if (!panelEl || panelEl.classList.contains('wa-hidden')) { __rerStat.skippedHidden++; return; }
    // 正在面板内输入时不重绘（重绘会抹掉未提交的输入）
    const ae = mainDoc.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') && panelEl.contains && panelEl.contains(ae)) { __rerStat.skippedTyping++; return; }
    if (__rerenderTimer) return;   // 节流：窗口内多次变更只重绘一次（防重绘风暴）
    __rerenderTimer = setTimeout(function () {
      __rerenderTimer = null;
      try { renderBody(); __rerStat.ran++; }
      catch (e) { __rerStat.failed++; if (WA.log) WA.log('warn', '面板自动重绘失败', e); }
    }, 150);
  }
  // v2.11.0: `backstage:started` / `backstage:settled` 此前只被悬浮球（呼吸动画）订阅，
  //   面板自身不重绘 ⇒ 运行态行只会停留在渲染那一刻的值（点了中止也不会变回「空闲」）。
  const STATE_EVENTS = ['clock:changed', 'chapters:changed', 'registry:changed', 'oracle:plan',
    'directEvent:started', 'directEvent:ended', 'chat:changed', 'api:channel-changed', 'backstage:settings',
    'backstage:started', 'backstage:settled'];
  WA.ui = {
    STATE_EVENTS: STATE_EVENTS,
    // v2.2.0: 当前页只读访问（UI 绑定守卫需要区分「非当前页控件不在 DOM」与「真断裂」）
    currentPage() { return currentPage; },
    pages() { return PAGES.map(function (p) { return p.id; }); },
    rerenderStat() { return { scheduled: __rerStat.scheduled, ran: __rerStat.ran, skippedHidden: __rerStat.skippedHidden, skippedTyping: __rerStat.skippedTyping, failed: __rerStat.failed, lastWhy: __rerStat.lastWhy }; },
    mounted: false,
    mount() {
      if (mainDoc.getElementById('wa-panel')) return;
      buildPanel(); buildOrb();
      // 世界推演状态事件 → 悬浮球呼吸
      WA.on('backstage:started', () => orbEl && orbEl.classList.add('wa-busy'));
      WA.on('backstage:settled', () => orbEl && orbEl.classList.remove('wa-busy'));
      // v2.1.0: 状态变更 → 自动重绘（此前这 9 个事件零订阅 = 界面永不刷新）
      STATE_EVENTS.forEach(function (evt) { WA.on(evt, function () { scheduleRerender(evt); }); });
      WA.ui.mounted = true;
      WA.log('info', 'UI已挂载（悬浮球+主面板）');
    },
    open() { toggle(true); }
  };
})();
