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
  /**
   * v2.51.0（第三十六面）: 注入源的中文名——**单一真源，提升到模块级**。
   *   此前同一张表在文件里被手写了两遍：`renderInject()` 里的 `NAMES` 与
   *   `renderDirector()` 里注入可见性那段的内联字面量。两遍的后果不是「多写几行」，
   *   而是**新增源时只改一处，另一处静默露出裸键名**：本版新增 `style`（叙事工艺）时，
   *   若只补 renderInject，导演页的可见性复选框就会显示 `style` 而不是「叙事工艺」，
   *   而后者恰恰是用户唯一能打开它的地方——两个页面各说各的名字，没人会去比对。
   *   提升后两处引用同一份，新增源只需在此表加一行（`SOURCES` 仍是枚举真源，
   *   本表只是它的显示名；缺名时下游已有 `|| k` 兜底，不会渲染成 undefined）。
   */
  const VIS_NAMES = { clock: '世界时间', background: '世界背景', people: '人物', currents: '暗流', echoes: '回声', memory: '记忆', opinion: '舆情', pulse: '世界脉搏', ledger: '重大事件账本', digest: '世界推演', style: '叙事工艺',
    // v2.56.0: v2.52.0~v2.55.0 新增的四条注入分支此前未登记源表，也**没在这里登记显示名**
    //   —— 面板会裸露英文键名（life/intel/org/longline）。补名与补源表是同一件事的两面。
    life: '人物生活', intel: '因果与情报', org: '资源与组织', longline: '长线伏笔',
    // v2.62.0: 因果结算。与 SOURCES 同批登记（只加源表不加显示名 ⇒ 面板裸露英文键名）。
    causal: '因果结算',
    // v2.63.0: 世界织体 / 社交漩涡 / 悬案。同上——只加源表不加显示名会让面板裸露英文键名。
    world: '世界织体', shadow: '社交漩涡', threads: '悬案',
    weather: '天气与物候', difficulty: '世界难度',
    // v2.66.0: 情绪通道 / 关系六型 / 假面。与 SOURCES 同批登记（不加显示名 ⇒ 面板裸露英文键名）。
    affect: '情绪通道', bonds: '关系六型', masks: '假面', temporalLock: '时间锁', temperament: '双层性格', fondness: '好感审计', parallelEvents: '场外事件',
    eraCycle: '资料片周期', survival: '生存三轴', warrant: '通缉', beastBond: '驯兽',
    appearance: '外貌契约', ladder: '原型阶梯', sceneSlice: '情境切片', gauge: '阻尼量规', rivalry: '竞争焦点' };

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
    { id: 'memory', icon: '🧠', label: '记忆' },
    { id: 'enemies', icon: '⚔️', label: '仇敌' },
    { id: 'parallel', icon: '🌀', label: '平行世界' },
    { id: 'inject', icon: '💉', label: '注入' },
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
    // [v2.18.0] 反向消费面扩到九本账：账本画像 + 对读面（环）。
    //   环必须**在面板上被点名**——它是对方读本扩展所得的投影，不是外部事实。
    const lsum = WA.lonshaReader.ledgerSummary(read.snapshot);
    const lb = WA.lonshaReader.ledgerBridges(read.snapshot);
    const secs = lsum.sections || {};
    const cmpB = (lb.items || []).filter(x => x.comparable);
    const driftB = cmpB.reduce((a, x) => a + (x.worldOnlyTotal || 0) + (x.localOnlyTotal || 0), 0);
    const confB = (lb.items || []).reduce((a, x) => a + (x.conflicts || 0), 0);
    const ledLine = '对方账本 ' + lsum.total + ' 本：有值 ' + (secs.value || 0) + '｜显式为空 ' + (secs.nullish || 0)
      + '｜未外供 ' + (secs.absent || 0) + (lsum.absentList.length ? '（' + lsum.absentList.join('、') + '）' : '');
    // 逐本看图（只报「叫什么、多大」，不搬运内容）——用户要的是「对方给了几本、各多厚」。
    const ledChips = WA.lonshaReader.ledgerSection(read.snapshot)
      .map(x => x.field + (x.present ? (x.kind === 'null' ? '·空' : '×' + x.size) : '·未外供'))
      .join('　');
    // 三处对读面逐处念：缺口四态 / 差集 / 位置冲突。**不可比的那处不报「差集 0」**——
    //   那会被读成「两边一致」，而它其实是「无从对读」。
    const bridgeChips = (lb.items || []).map(x => {
      if (!x.comparable) return x.id + '·不可比';
      const d = (x.worldOnlyTotal || 0) + (x.localOnlyTotal || 0);
      return x.id + '·' + (d ? '差 ' + d : '一致') + (x.conflicts ? '·冲突' + x.conflicts : '')
        + (x.id === 'currents' && x.verdict ? '·' + x.verdict : '');
    }).join('　');
    const bridgeLine = '对读面 ' + cmpB.length + '/3 可比'
      + (driftB ? '｜差集 ' + driftB + ' 项' : '') + (confB ? '｜位置冲突 ' + confB + ' 处' : '')
      + '（明细见诊断 JSON）';
    // 上游键集自证：本侧读的键上游是不是真有。缺口**不可知**（no-filter）与**明确无缺口**（complete）
    //   必须在屏幕上分得开——这两件事的处置相反。
    const esh = lb.echoShape || {};
    const keyLine = esh.present
      ? '对读读数键集：本侧认 ' + (esh.readKeys || []).length + ' 键｜上游实给 '
        + ((esh.readKeys || []).length - (esh.missing || []).length) + ' 键'
        + ((esh.missing || []).length ? '｜⚠️ 本侧读了上游没有的 ' + esh.missing.join('、') : '')
        + ((esh.unknown || []).length ? '｜上游另有未消费 ' + esh.unknown.join('、') : '')
      : '';
    return '<div class="wa-card"><div class="wa-card-h">记忆桥（读 LonSha 账本 · lonsha_memory_bridge_v1）</div>' +
      '<div class="wa-kv">对账：' + (bad ? '<span class="wa-bad">' : '') + esc(VD[d.verdict] || d.verdict) + (bad ? '</span>' : '') + '</div>' +
      '<div class="wa-kv">本扩展 ' + esc(d.worldDate || '（无公历钟）') + ' ｜LonSha ' + esc(d.lonshaDate || '（未记录）') + '</div>' +
      '<div class="wa-kv">对方快照：floor=' + (sum.floor || 0) + '｜' + (sum.selfBytes || 0) + ' 字节｜契约 '
      + esc(sum.contract || '未自述') + (sum.pluginVersion ? '｜版本 ' + esc(sum.pluginVersion) : '') + '</div>' +
      (sum.absent.length || sum.nullish.length
        ? '<div class="wa-kv">未外供 ' + esc(sum.absent.join('、') || '—') + '｜显式为空 ' + esc(sum.nullish.join('、') || '—') + '</div>'
        : '') +
      '<div class="wa-kv">' + esc(ledLine) + '</div>' +
      '<div class="wa-kv">' + esc(bridgeLine) + '</div>' +
      '<div class="wa-kv">对读面逐处：' + esc(bridgeChips) + '</div>' +
      '<div class="wa-kv">逐本：' + esc(ledChips) + '</div>' +
      (keyLine ? '<div class="wa-kv' + ((esh.missing || []).length ? ' wa-bad' : '') + '">' + esc(keyLine) + '</div>' : '') +
      (lsum.echoPresent
        ? '<div class="wa-kv"><span class="wa-bad">对读读数是环</span>（' + esc(WA.lonshaReader.ECHO_SECTION)
          + '）：它反映的是<b>对方眼里的本扩展</b>，不是「对方的世界」——引用前须认得 kind=echo</div>'
        : '') +
      '<div class="wa-hint">这是本扩展对 LonSha 记忆桥的**唯一**消费点（此前全库零消费，引用只在注释里）。<br>' +
      '只读：不写对方的账本、不改本扩展的世界钟——两个钟对不上只报不管，<b>谁拍板由用户决定</b>。<br>' +
      '「未外供」与「显式为空」是两件事（本扩展尊重对方 v3.174 的三态自述），故分别列出。<br>' +
      'v2.18.0 起读的**不只是 `clock` 一个字段**：对方八本账 + 一本对读读数逐本看图，并对三本账报差集。</div></div>';
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
      <div class="wa-sec">世界钟 <button class="wa-btn wa-mini" id="wa-set-clock">设定</button> <button class="wa-btn wa-mini" id="wa-next-day" title="推进一天（保留时段由引擎单一实现决定）">下一日</button></div>
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
      <button class="wa-btn" id="wa-save-bg" title="保存世界背景/基调/规则（纯框架，不预设内容）">保存背景</button>
      <div class="wa-sec">权威世界事实（${s.worldFacts.length}）</div>
      <div class="wa-list">${s.worldFacts.slice(-15).reverse().map(f => `<div class="wa-item"><b>${esc(f.key)}</b> = ${esc(f.value)}</div>`).join('') || '<div class="wa-empty">尚无已结算事实</div>'}</div>
      <div class="wa-sec">暗流（${s.currents.length}）</div>
      <div class="wa-list">${s.currents.slice(-10).reverse().map(c => `<div class="wa-item"><span class="wa-badge wa-vis-${c.visibility}">${c.visibility}</span> <b>${esc(c.title)}</b> <span class="wa-dim">${esc(c.stage)}</span><div class="wa-dim">${esc(c.summary || '').slice(0, 120)}</div></div>`).join('') || '<div class="wa-empty">暂无暗流</div>'}</div>
      <div class="wa-sec">纪事（${s.chronicle.length}）</div>
      <div class="wa-list">${s.chronicle.slice(-10).reverse().map(c => `<div class="wa-item wa-dim">${esc(c.title)} — ${esc((c.summary || '').slice(0, 80))}</div>`).join('') || '<div class="wa-empty">暂无纪事</div>'}</div>
      ${(() => {
        // v2.35.0: 世界书蓝绿灯选择/覆写/触发预览（此前引擎有、面板零入口）
        if (!WA.worldbook) return '<div class="wa-sec">世界书</div><div class="wa-dim">世界书模块未加载</div>';
        const trig = (typeof WA.worldbook.triggerEnabled === 'function') ? WA.worldbook.triggerEnabled() : false;
        if (typeof WA.worldbook.peekEntries === 'function') WA.worldbook.peekEntries();
        const rows = (typeof WA.worldbook.previewActivation === 'function') ? WA.worldbook.previewActivation(__wbScan) : [];
        const ovOpts = (WA.worldbook.OVERRIDE_VALUES || ['const', 'key', 'off']);
        const list = rows.length ? rows.map(function (r) {
          const ov = r.override || 'auto';
          const sel = ovOpts.map(function (v) { return '<option value="' + v + '"' + (ov === v ? ' selected' : '') + '>' + (v === 'const' ? '常驻' : v === 'key' ? '关键词' : '关闭') + '</option>'; }).join('');
          return '<div class="wa-item"><label class="wa-node"><input type="checkbox" data-wb-sel="' + esc(r.id) + '" ' + (r.selected ? 'checked' : '') + '/><span class="wa-node-label"><b>' + esc(r.title) + '</b></span></label>'
            + ' <select class="wa-input wa-w60" data-wb-ov="' + esc(r.id) + '"><option value="auto"' + (ov === 'auto' ? ' selected' : '') + '>自动</option>' + sel + '</select>'
            + ' <span class="wa-badge' + (r.active ? ' wa-on' : '') + '">' + (r.active ? '注入' : '跳过') + '</span>'
            + '<div class="wa-dim">' + esc(r.world || '') + ' · ' + esc(r.reason || '') + ((r.keys && r.keys.length) ? ' · 键 ' + esc(r.keys.slice(0, 4).join('/')) : '') + '</div></div>';
        }).join('') : '<div class="wa-empty">尚无条目缓存——点「刷新条目」从当前世界书载入，无头环境可用 seedEntries mock</div>';
        return '<div class="wa-sec">世界书蓝绿灯（' + rows.length + '）</div>'
          + '<label class="wa-node"><input type="checkbox" id="wa-wb-trigger" ' + (trig ? 'checked' : '') + '/><span class="wa-node-label">关键词触发（关=已选全量注入）</span></label>'
          + '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-wb-refresh" title="从酒馆当前世界书载入条目（失败则保留缓存）">刷新条目</button>'
          + '<button class="wa-btn wa-mini" id="wa-wb-preview" title="用扫描文本预览蓝绿灯命中">预览触发</button></div>'
          + '<textarea id="wa-wb-scan" class="wa-ta" placeholder="扫描文本（预览关键词命中，可空）">' + esc(__wbScan) + '</textarea>'
          + '<div class="wa-list" id="wa-wb-list">' + list + '</div>'
          + '<div id="wa-wb-out" class="wa-out"></div>';
      })()}`;

  }

  function renderPeople() {
    const s = WA.store.get();
    const reg = WA.registry.list();
    const people = Object.values(s.people);
    // v2.62.0：身份 ↔ 存档键对照表。`idStat()` 的 drifted 非空即说明
    //   「有人带着长期状态，却从未被登记过身份」——这在此前**完全不可观测**。
    const settleRows = (function () {
      const w = (s.world && typeof s.world === 'object') ? s.world : {};
      const js = (Array.isArray(w.journeys) ? w.journeys : []).filter(function (j) { return j && j.status === 'in-transit'; });
      const wx = (s.weather && Array.isArray(s.weather.rows)) ? s.weather.rows : [];
      const df = (WA.difficulty && typeof WA.difficulty.effective === 'function') ? WA.difficulty.effective() : null;
      const jLine = js.length
        ? js.slice(0, 4).map(function (j) { return esc(j.person) + ' ' + esc(j.from) + '→' + esc(j.to) + ' 剩' + j.left + '分'; }).join('；')
        : '无';
      const wLine = wx.length
        ? wx.slice(0, 4).map(function (x) { return esc(x.place) + ' ' + esc(x.kind); }).join('；')
        : '未登记';
      const dLine = !df ? '模块未装载'
        : (df.enabled ? (esc(df.resistance) + ' / ' + esc(df.stance) + ' / ' + esc(df.pace)) : '关闭（中性值，不改结算）');
      return '<div class="wa-item wa-dim">在途：' + jLine + '</div>'
        + '<div class="wa-item wa-dim">天气：' + wLine + '</div>'
        + '<div class="wa-item wa-dim">难度：' + dLine + '</div>';
    })();
    const idRows = (function () {
      if (!WA.registry || typeof WA.registry.idStat !== 'function') return '<div class="wa-item wa-dim">身份模块不可用</div>';
      const st = WA.registry.idStat();
      const ks = Object.keys(st.worldKeys || {});
      const head = '<div class="wa-item wa-dim">已绑定 ' + st.bound + ' 人 · 活动槽 ' + st.slotUsed + '/' + st.slotCapacity
        + ' · 有身份但未占本轮槽 ' + st.beyondSlots + ' 人'
        + (st.drifted ? ' · <b>身份缺失 ' + st.stateWithoutId.length + ' 人</b>（有状态无编号）' : '') + '</div>';
      if (!ks.length) return head;
      return head + ks.map(function (k) {
        return '<div class="wa-item">' + esc(k) + ' → ' + (st.worldKeys[k] || '<b>未绑定</b>') + '</div>';
      }).join('');
    })();
    return `
      <div class="wa-sec">长线伏笔（承诺回收时刻）</div>
      <label class="wa-row"><input id="wa-ll-enabled" type="checkbox" ${WA.longline && WA.longline.getSettings().enabled ? 'checked' : ''}/> 启用长线伏笔提醒</label>
      <div class="wa-row"><input id="wa-ll-id" class="wa-input" placeholder="伏笔 id"/><input id="wa-ll-due" class="wa-input" placeholder="分钟（多久后应收）"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-ll-promise">设定承诺</button><button class="wa-btn" id="wa-ll-sweep">扫描欠账</button></div>
      <div id="wa-ll-out" class="wa-out"></div>
      <div class="wa-sec">资源与组织</div>
      <label class="wa-row"><input id="wa-org-enabled" type="checkbox" ${WA.org && WA.org.getSettings().enabled ? 'checked' : ''}/> 启用资源与组织</label>
      <div class="wa-row"><input id="wa-org-kind" class="wa-input" placeholder="faction 或 person"/><input id="wa-org-name" class="wa-input" placeholder="持有者"/><input id="wa-org-item" class="wa-input" placeholder="资源"/><input id="wa-org-qty" class="wa-input" placeholder="数量"/></div>
      <div class="wa-row"><input id="wa-org-to-kind" class="wa-input" placeholder="接收类型"/><input id="wa-org-to-name" class="wa-input" placeholder="接收者"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-org-grant">入库</button><button class="wa-btn" id="wa-org-transfer">转移</button><button class="wa-btn" id="wa-org-check">检查余额</button></div>
      <div id="wa-org-out" class="wa-out"></div>
      <div class="wa-sec">因果与情报</div>
      <label class="wa-row"><input id="wa-intel-enabled" type="checkbox" ${WA.intel && WA.intel.getSettings().enabled ? 'checked' : ''}/> 启用因果与情报</label>
      <div class="wa-row"><input id="wa-intel-cause" class="wa-input" placeholder="已有前因"/><input id="wa-intel-effect" class="wa-input" placeholder="结果"/></div>
      <div class="wa-row"><input id="wa-intel-person" class="wa-input" placeholder="知情人物"/><input id="wa-intel-claim" class="wa-input" placeholder="情报"/><input id="wa-intel-source" class="wa-input" placeholder="来源"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-intel-link">加因果</button><button class="wa-btn" id="wa-intel-add">加情报</button></div>
      <div id="wa-intel-out" class="wa-out"></div>
      <div class="wa-sec">人物生活（目标、承诺、日程）</div>
      <label class="wa-row"><input id="wa-life-enabled" type="checkbox" ${WA.life && WA.life.getSettings().enabled ? 'checked' : ''}/> 启用人物生活</label>
      <div class="wa-row"><input id="wa-life-person" class="wa-input" placeholder="人物"/><input id="wa-life-text" class="wa-input" placeholder="目标、承诺或日程"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-life-goal">加目标</button><button class="wa-btn" id="wa-life-promise">加承诺</button><button class="wa-btn" id="wa-life-schedule">加日程</button><button class="wa-btn" id="wa-life-tick">结算</button></div>
      <div id="wa-life-out" class="wa-out"></div>
      <div class="wa-sec">因果结算（原因→条件→行动→后果）</div>
      <label class="wa-row"><input id="wa-causal-enabled" type="checkbox" ${WA.causal && WA.causal.getSettings().enabled ? 'checked' : ''}/> 启用因果结算</label>
      <div class="wa-row"><input id="wa-causal-cause" class="wa-input" placeholder="已有前因（须已存在）"/><input id="wa-causal-condition" class="wa-input" placeholder="条件（可空）"/><input id="wa-causal-action" class="wa-input" placeholder="行动"/></div>
      <div class="wa-row"><input id="wa-causal-immediate" class="wa-input" placeholder="直接后果（落进世界事实）"/><input id="wa-causal-delayed" class="wa-input" placeholder="延迟后果（只排期，不到期不算发生）"/><input id="wa-causal-delayed-min" class="wa-input" placeholder="多久后(分钟)"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-causal-add">建链</button><button class="wa-btn" id="wa-causal-tick">推进一轮</button><button class="wa-btn" id="wa-causal-due">查到期</button><button class="wa-btn" id="wa-causal-classify">查状态</button></div>
      <div class="wa-row"><input id="wa-causal-id" class="wa-input" placeholder="链 id"/><input id="wa-causal-by" class="wa-input" placeholder="延期毫秒(可负)"/><button class="wa-btn" id="wa-causal-defer">延期</button><button class="wa-btn" id="wa-causal-cancel">取消</button><button class="wa-btn" id="wa-causal-settle">结算到期</button></div>
      <div id="wa-causal-out" class="wa-out"></div>
      <div class="wa-sec">人物身份（持久 ID ↔ 存档键）</div>
      <div class="wa-row"><input id="wa-id-name" class="wa-input" placeholder="人物姓名"/><button class="wa-btn" id="wa-id-lookup">查身份</button><button class="wa-btn" id="wa-id-bindall" title="为当前聊天里已经注册、但还没有持久编号的人物补上编号（不改动任何状态）">补全已注册</button><button class="wa-btn" id="wa-id-clear" title="只解除身份绑定，不删除该人物的任何状态">解除绑定</button></div>
      <div id="wa-id-out" class="wa-out"></div>
      <div class="wa-list">${idRows}</div>
      <div class="wa-sec">世界织体（地点、道路、共同日程）</div>
      <div class="wa-list">${settleRows}</div>
      <label class="wa-row"><input id="wa-world-enabled" type="checkbox" ${WA.world && WA.world.getSettings().enabled ? 'checked' : ''}/> 启用世界织体</label>
      <div class="wa-row"><input id="wa-world-place" class="wa-input" placeholder="地点名"/><button class="wa-btn" id="wa-world-addplace" title="登记一个地点：没登记的地方不可达（不猜「大概很近」）">登记地点</button><button class="wa-btn" id="wa-world-reach">查可到</button></div>
      <div class="wa-row"><input id="wa-world-rd-a" class="wa-input" placeholder="从"/><input id="wa-world-rd-b" class="wa-input" placeholder="到"/><input id="wa-world-rd-min" class="wa-input" placeholder="分钟"/><button class="wa-btn" id="wa-world-addroad" title="登记一条道路：没登记的路走不通">登记道路</button></div>
      <div class="wa-row"><input id="wa-world-ev-title" class="wa-input" placeholder="共同日程名"/><input id="wa-world-ev-place" class="wa-input" placeholder="地点"/><button class="wa-btn" id="wa-world-addevent">登记日程</button><button class="wa-btn" id="wa-world-tick">推进日程</button><button class="wa-btn" id="wa-world-who" title="到场者只认日程证据——没依据的人不会出现在名单里">查到会人</button></div>
      <div class="wa-row"><input id="wa-world-mv-who" class="wa-input" placeholder="人物"/><input id="wa-world-mv-from" class="wa-input" placeholder="从"/><input id="wa-world-mv-to" class="wa-input" placeholder="到"/><button class="wa-btn" id="wa-world-move" title="先问路通不通，再问此人这一刻在不在别处">移动</button><button class="wa-btn" id="wa-world-canbe">能否在场</button></div>
      <div id="wa-world-out" class="wa-out"></div>
      <div class="wa-sec">社交漩涡（共同隐瞒、关系经历）</div>
      <label class="wa-row"><input id="wa-shadow-enabled" type="checkbox" ${WA.shadow && WA.shadow.getSettings().enabled ? 'checked' : ''}/> 启用社交漩涡</label>
      <div class="wa-row"><input id="wa-shadow-a" class="wa-input" placeholder="甲"/><input id="wa-shadow-b" class="wa-input" placeholder="乙"/><input id="wa-shadow-secret" class="wa-input" placeholder="共同隐瞒的事"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-shadow-add" title="共同隐瞒必须双方各持一行——单方面持有的不是共同秘密">记隐瞒</button><button class="wa-btn" id="wa-shadow-deepen" title="只在已有秘密且仍在生效时才允许加深">加深</button><button class="wa-btn" id="wa-shadow-brighten" title="只降胁迫感，不删「秘密存在过」这一事实">变淡</button><button class="wa-btn" id="wa-shadow-lookup">查此对</button><button class="wa-btn" id="wa-shadow-visible" title="此人「持有」的秘密（而不是「关于此人」的秘密）——两件事极易混">查持有</button></div>
      <div class="wa-row"><input id="wa-shadow-what" class="wa-input" placeholder="关系经历（发生过什么）"/><button class="wa-btn" id="wa-shadow-exp-kept" title="履行：守了。与背弃分开留痕">记履行</button><button class="wa-btn" id="wa-shadow-exp-broken" title="背弃：赖了。不得写成「关系结束」而隐去他赖了">记背弃</button></div>
      <div id="wa-shadow-out" class="wa-out"></div>
      <div class="wa-sec">悬案（线索、矛盾、结案依据）</div>
      <label class="wa-row"><input id="wa-threads-enabled" type="checkbox" ${WA.threads && WA.threads.getSettings().enabled ? 'checked' : ''}/> 启用悬案</label>
      <div class="wa-row"><input id="wa-threads-q" class="wa-input" placeholder="待查的问题"/><button class="wa-btn" id="wa-threads-open">立案</button></div>
      <div class="wa-row"><input id="wa-threads-id" class="wa-input" placeholder="案 id"/><input id="wa-threads-claim" class="wa-input" placeholder="线索主张"/><input id="wa-threads-src" class="wa-input" placeholder="来源"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-threads-lead" title="没来源的线索不是线索：可靠性由来源类型决定，不由「我觉得可信」决定">加线索</button><button class="wa-btn" id="wa-threads-refute" title="反证：与支撑线索打脸的必须各自保留，不得取平均">加反证</button><button class="wa-btn" id="wa-threads-converge">汇聚</button><button class="wa-btn" id="wa-threads-stall" title="查不下去但仍在查——记录不删，这不是结案">悬置</button></div>
      <div class="wa-row"><input id="wa-threads-answer" class="wa-input" placeholder="结案结论（须有依据）"/><button class="wa-btn" id="wa-threads-resolve" title="结案必须有依据：无线索支撑、或矛盾未解时一律拒收">结案</button><button class="wa-btn" id="wa-threads-abandon" title="主动放下并写明理由——与「悬置」是两种事实">放弃</button><button class="wa-btn" id="wa-threads-why">查依据</button></div>
      <div id="wa-threads-out" class="wa-out"></div>
      <div class="wa-sec">NPC注册（发送前独白推演的候选集）</div>
      <div class="wa-row"><input id="wa-npc-name" class="wa-input" placeholder="角色全名…"/><button class="wa-btn" id="wa-npc-add" title="把角色名加入「发送前独白推演」的候选集（不是创建人物卡）">注册</button></div>
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
    // v2.22.0: 键集必须等于 evolution.FACTION_STATUS（鼎盛|稳固|倾轧|困顿|衰落|瓦解）。
    //   此前写的是另一套自造枚举（强盛/平稳/衰退/动荡）⇒ 引擎真值 4/6 回退默认 ⚪，
    //   徽章色与势力状态**无关**（用户可见的错误呈现）。同族先例见 tool-analyzer v0.9.6。
    const factionBadge = st => ({'鼎盛':'🟡','稳固':'🟢','倾轧':'🔵','困顿':'🟠','衰落':'🔴','瓦解':'⚫'}[st]||'⚪');
    const relBadge = r => ({'血盟':'💞','盟友':'🤝','友好':'😊','中立':'😐','冷淡':'😒','敌对':'⚔️','世仇':'💀'}[r]||'😐');
    const repColor = l => ({'万众敬仰':'#4caf50','受人尊敬':'#8bc34a','默默无闻':'#9e9e9e','声名狼藉':'#ff5722','天怒人怨':'#f44336'}[l]||'#9e9e9e');
    const ecoColor = c => ({'繁荣':'#4caf50','平稳':'#2196f3','衰退':'#ff9800','动荡':'#f44336'}[c]||'#2196f3');

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
      ${active ? `<div class="wa-item"><b>${esc(active.title)}</b> <span class="wa-badge">第${active.currentTurn}/${active.totalTurns}轮</span><div class="wa-dim">对手：${esc(active.opponent || '未通报')}</div><button class="wa-btn wa-mini" id="wa-de-abort" title="立即终止当前突发事件">中止事件</button></div>`
        : `<div class="wa-row"><input id="wa-de-prompt" class="wa-input" placeholder="事件要求（可空）…"/><input id="wa-de-turns" class="wa-input wa-w60" type="number" value="6" min="1" max="30"/><button class="wa-btn" id="wa-de-create" title="生成一场分轮次的突发事件（每轮推进一个阶段）">生成事件</button></div>`}

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
        // v2.64.0: 掷骰与跳过必须**互斥**显示——此前 rolls 把「通道关闭而跳过」也算成掷过，
        //   于是用户主动关掉随机事件时，面板那句「掷骰 N 次但零触发」是一句**假话**（它一次都没掷）。
        //   修好后此处并排显示：掷了几次 / 跳过几次（含关通道），理由按有限分类聚合。
        const __rk = hzEn && hzEn.reasonKinds && hzEn.reasonKinds.length
          ? ' · 理由 ' + hzEn.reasonKinds.map(function (k) { return k + '×' + (hzEn.reasons[k] || 0); }).join('/') : '';
        const tail = hzEn ? `<div class="wa-dim">掷骰 ${hzEn.rolls} 次 · 触发 远${hzEn.distantFired}/近${hzEn.nearFired} · 跳过（关） ${hzEn.skipped}${__rk}${hzEn.lastReason ? ' · 最近：' + esc(hzEn.lastReason) : ''}</div>` : '';
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

      ${(() => {
        // v2.35.0: 实体库四类呈现 + 手工 upsert（此前引擎有、面板零入口）
        const types = (WA.entities && WA.entities.ENTITY_TYPES) || ['organization', 'object', 'ability', 'location'];
        const labels = (WA.entities && WA.entities.TYPE_LABELS) || { organization: '组织', object: '物品', ability: '能力', location: '地点' };
        const em = (s.evolution && s.evolution.entityMemory) || {};
        const blocks = types.map(function (t) {
          const arr = em[t] || [];
          const items = arr.slice(-8).reverse().map(function (e) {
            return '<div class="wa-item"><b>' + esc(e.name) + '</b>' + ((e.aliases && e.aliases.length) ? ' <span class="wa-dim">' + esc(e.aliases.join('/')) + '</span>' : '') + (e.desc ? '<div class="wa-dim">' + esc(String(e.desc).slice(0, 80)) + '</div>' : '') + '</div>';
          }).join('') || '<div class="wa-empty">暂无</div>';
          return '<div class="wa-sec">' + esc(labels[t] || t) + '（' + arr.length + '）</div><div class="wa-list">' + items + '</div>';
        }).join('');
        const opts = types.map(function (t) { return '<option value="' + t + '">' + esc(labels[t] || t) + '</option>'; }).join('');
        return '<div class="wa-sec">实体库</div>'
          + '<div class="wa-row"><select id="wa-ent-type" class="wa-input wa-w60">' + opts + '</select>'
          + '<input id="wa-ent-name" class="wa-input" placeholder="名称" maxlength="40"/>'
          + '<input id="wa-ent-desc" class="wa-input" placeholder="描述（可选）" maxlength="150"/>'
          + '<button class="wa-btn wa-mini" id="wa-ent-add" title="手工写入实体库（走 entities.upsert）">录入</button></div>'
          + blocks
          + '<div id="wa-ent-out" class="wa-out"></div>';
      })()}
      ${(() => {
        // v2.35.0: 重大事件账本呈现（读 ledger.buildLedgerText / evolution.ledger）
        const txt = (WA.ledger && typeof WA.ledger.buildLedgerText === 'function') ? WA.ledger.buildLedgerText() : '';
        const n = ((s.evolution && s.evolution.ledger) || []).length;
        return '<div class="wa-sec">重大事件账本（' + n + ' 轮）</div>'
          + (txt ? '<div class="wa-item"><pre class="wa-dim" id="wa-ledger-text">' + esc(txt) + '</pre></div>' : '<div class="wa-empty" id="wa-ledger-text">尚无账本——推演一轮后对比存档点才会写入</div>');
      })()}
      <div class="wa-sec">章节</div>
      ${s.chapters.current ? `<div class="wa-item"><b>${esc(s.chapters.current.title)}</b><div class="wa-dim">${esc((s.chapters.current.script || '').slice(0, 150))}</div><button class="wa-btn wa-mini" id="wa-ch-end">结束本章</button></div>`
        : `<div class="wa-row"><input id="wa-ch-title" class="wa-input" placeholder="章节标题…"/><button class="wa-btn" id="wa-ch-start" title="开启新章节，章节回顾会归入它">开始章节</button></div>`}`;
  }

// ===== v2.33.0（第二十面：能力面 -> 呈现面）=====
  // 设计动机：本仓 66 个产品文件里 30 个零 UI 入口，其中 memory.js（92 方法，全库最大单体）
  //   承载 L0->L1->L2->L3 分层回顾 / facts 更迭 / 伏笔生命周期——世界引擎喂给模型的全部记忆原料，
  //   面板此前只有一个「长期事实 N」数字；engines/timeline.js 整套记忆溯源（来源楼层 + 有效性
  //   审计 valid/changed/missing）生产端真用、UI 零出口；注入链（inspector/budget/slotAudit）
  //   回答的恰是最致命的「这轮注进去没」，同样零出口。本版把三者摆上界面。
  // 数据源铁律：只读 store.get() 与**非冻结**导出（timeline.auditRefs/captureRange/unionRefs/SOURCE_ID_KEY、
  //   injectInspector.getLastSnapshot/statusText、injectBudget.summaryText、evict.siteDecls、memory.stats）。
  //   绝不调用 dead 账本冻结的导出（timeline.sourceRef、injectInspector.flatten 等）——否则证据复算当场报失实。
  let __memQ = '';
  let __memRefKey = null;
  let __injQ = '';
  let __wbScan = '';  // v2.35.0: 世界书预览扫描文本（切页不丢）

  function _msTs(t) { if (!t) return ''; try { return new Date(t).toLocaleString(); } catch (e) { return String(t); } }
  function _msAudit(refs) { try { return (WA.timeline && WA.timeline.auditRefs) ? WA.timeline.auditRefs(refs || []) : null; } catch (e) { return null; } }
  function _msRefBadge(refs) {
    try {
      const a = _msAudit(refs);
      if (!a) return '';
      const n = (a.refs || []).length;
      if (!n) return '<span class="wa-badge wa-vis-hidden">无溯源</span>';
      const hasChanged = !!(a.changed && a.changed.length);
      const cls = a.valid ? 'wa-vis-public' : (hasChanged ? 'wa-vis-trace' : 'wa-vis-hidden');
      const st = a.valid ? '有效' : (hasChanged ? '正文已变' : '楼层缺失');
      const tip = '出处楼层 ' + a.startLayer + '-' + a.endLayer + '\uff5c引用 ' + n + ' 处\uff5c' + st + (a.missing && a.missing.length ? '\uff5c缺失 ' + a.missing.length : '');
      return '<span class="wa-badge ' + cls + '" title="' + esc(tip) + '">' + esc(st) + '楼' + esc(String(a.startLayer)) + '-' + esc(String(a.endLayer)) + '</span>';
    } catch (e) { return ''; }
  }
  function _msFloorText(refs) {
    try {
      const ctx = (mainWin.SillyTavern && mainWin.SillyTavern.getContext) ? mainWin.SillyTavern.getContext() : null;
      const chat = (ctx && ctx.chat) || [];
      const KEY = (WA.timeline && WA.timeline.SOURCE_ID_KEY) || 'worldaxis_source_id';
      const parts = [];
      (refs || []).forEach(function (rf) {
        const mid = String(rf.messageId == null ? '' : rf.messageId);
        let m = null, idx = -1;
        for (let i = 0; i < chat.length; i++) {
          const e = chat[i] && chat[i].extra;
          if (e && String(e[KEY]) === mid) { m = chat[i]; idx = i; break; }
        }
        if (!m && rf.layer != null && chat[rf.layer]) { m = chat[rf.layer]; idx = rf.layer; }
        if (!m) return;
        parts.push('[楼' + (rf.layer != null ? rf.layer : idx) + '|' + String(rf.role || (m.is_user ? 'user' : 'char')) + '] ' + String(m.mes || '').slice(0, 400));
      });
      return parts.join('\n\n');
    } catch (e) { return ''; }
  }
  function _msRefToggle(key, refs) {
    const isOpen = __memRefKey === key;
    const txt = isOpen ? _msFloorText(refs) : '';
    return '<button class="wa-btn wa-mini" data-refview="' + esc(key) + '" title="展开该条目引用的原始楼层正文">' + (isOpen ? '收起出处' : '查看出处') + '</button>' + (isOpen ? '<div class="wa-out">' + (txt ? esc(txt) : '（该条目引用的楼层在当前聊天中已找不到）') + '</div>' : '');
  }

  function renderMemory() {
    const s = WA.store.get();
    const mem = s.memory || {};
    const L0 = mem.l0 || [], L1 = mem.l1 || [], L2 = mem.l2 || [], L3 = mem.l3 || [];
    const facts = mem.facts || [];
    const fsArr = mem.foreshadows || [];
    const pf = mem.pmem || [];
    const chron = s.chronicle || [];
    const q = __memQ.trim();
    const hit = function (t) { return !q || String(t == null ? '' : t).indexOf(q) >= 0; };
    let st = null; try { st = (WA.memory && WA.memory.stats) ? WA.memory.stats() : null; } catch (e) {}
    const factsOn = facts.filter(function (f) { return f && f.active !== false; }).length;
    let out = '';
    out += '<div class="wa-stat-grid">'
      + '<div class="wa-stat"><div class="wa-stat-v">' + L0.length + '</div><div class="wa-stat-k">L0 单轮</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + L1.length + '</div><div class="wa-stat-k">L1 阶段</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + L2.length + '</div><div class="wa-stat-k">L2 章节</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + L3.length + '</div><div class="wa-stat-k">L3 长线</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + factsOn + '/' + facts.length + '</div><div class="wa-stat-k">事实 活跃/总</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + fsArr.length + '</div><div class="wa-stat-k">伏笔</div></div>'
      + '</div>';
    out += '<div class="wa-sec">检索<span class="wa-dim">（过滤下方全部记忆条目）</span></div>'
      + '<div class="wa-row"><input id="wa-mem-q" class="wa-input" placeholder="搜记忆/facts/伏笔/编年…" value="' + esc(__memQ) + '"/>'
      + '<button class="wa-btn" id="wa-mem-q-go" title="按关键词过滤下方记忆条目（空则显示全部）">搜</button></div>';
    if (st) out += '<div class="wa-dim">巩固链：' + st.rounds + ' 轮，最近 ' + st.lastMs + 'ms／均 ' + st.avgMs + 'ms</div>';
    const LAYER_DEF = [['L0 单轮摘要', L0], ['L1 阶段回顾', L1], ['L2 章节回顾', L2], ['L3 长线沉淀', L3]];
    LAYER_DEF.forEach(function (pair, li) {
      const name = pair[0], arr = pair[1];
      const rows = [];
      arr.forEach(function (x, i) {
        const txt = (x && (x.s != null ? x.s : x.text)) || '';
        if (!hit(txt)) return;
        const key = 'L' + li + '#' + i;
        rows.push('<div class="wa-item">' + esc(String(txt)) + ' <span class="wa-dim">' + esc(_msTs(x && x.t)) + '</span> ' + _msRefBadge(x && x.refs)
          + ' ' + _msRefToggle(key, (x && x.refs) || []) + '</div>');
      });
      out += '<div class="wa-sec">' + esc(name) + '（' + arr.length + '）</div>'
        + '<div class="wa-list">' + (rows.join('') || '<div class="wa-empty">' + (arr.length ? '无匹配' : '尚未生成（随推演自动巩固）') + '</div>') + '</div>';
    });
    const fRows = [];
    facts.forEach(function (f, i) {
      if (!f) return;
      if (!hit(f.key) && !hit(f.value)) return;
      fRows.push('<div class="wa-item"><b>' + esc(f.key) + '</b> = ' + esc(f.value)
        + ' <span class="wa-badge' + (f.active === false ? '' : ' wa-on') + '">v' + esc(String(f.version || 1)) + (f.active === false ? '停' : '') + '</span>'
        + ' <span class="wa-dim">' + esc(_msTs(f.at)) + (f.reason ? '｜' + esc(String(f.reason).slice(0, 40)) : '') + '</span>'
        + ' <button class="wa-btn wa-mini" data-facttoggle="' + i + '" title="启/停用该事实（停用后不再注入正文）">' + (f.active === false ? '启用' : '停用') + '</button>'
        + '<button class="wa-btn wa-mini" data-factdel="' + i + '" title="删除该事实（可经撤销编辑回滚）">删除</button></div>');
    });
    out += '<div class="wa-sec">长期事实（' + factsOn + ' 活跃 / ' + facts.length + ' 总）</div>'
      + '<div class="wa-list">' + (fRows.join('') || '<div class="wa-empty">' + (facts.length ? '无匹配' : '尚无长期事实') + '</div>') + '</div>'
      + '<div class="wa-row"><input id="wa-mem-fact-k" class="wa-input" placeholder="事实名（如 王都守卫人数）"/>'
      + '<input id="wa-mem-fact-v" class="wa-input" placeholder="内容"/></div>'
      + '<button class="wa-btn" id="wa-mem-fact-add" title="新增一条长期事实（走受控写入，可撤销）">新增事实</button>'
      + '<button class="wa-btn wa-mini" id="wa-mem-facts-clear" title="清空全部长期事实（入撤销栈，可回滚）" ' + (facts.length ? '' : 'disabled') + '>清空</button>';
    const FS_ST = { waiting: ['等待', 'wa-vis-hidden'], developing: ['发展中', 'wa-vis-trace'], triggered: ['已触发', 'wa-vis-public'], recycled: ['已回收', 'wa-vis-public'], dropped: ['已放弃', ''] };
    const sRows = [];
    fsArr.forEach(function (f, i) {
      if (!f) return;
      if (!hit(f.content)) return;
      const meta = FS_ST[f.status] || [f.status || '?', ''];
      sRows.push('<div class="wa-item">' + esc(f.content) + ' <span class="wa-badge ' + meta[1] + '">' + esc(meta[0]) + '</span>'
        + ' <span class="wa-dim">链' + ((f.links || []).length) + '｜' + esc(_msTs(f.at)) + '</span> ' + _msRefBadge(f.refs)
        + ' <button class="wa-btn wa-mini" data-fsst="' + i + '" title="推进伏笔状态：等待→发展中→已触发→已回收">⏩' + esc(meta[0]) + '</button>'
        + ' <button class="wa-btn wa-mini" data-fsdrop="' + i + '" title="放弃该伏笔（标记为已放弃，不再参与注入）">弃</button>'
        + ' <button class="wa-btn wa-mini" data-fsdel="' + i + '" title="删除该伏笔（可经撤销编辑回滚）">删除</button></div>');
    });
    out += '<div class="wa-sec">伏笔生命周期（' + fsArr.length + '）</div>'
      + '<div class="wa-list">' + (sRows.join('') || '<div class="wa-empty">' + (fsArr.length ? '无匹配' : '尚无伏笔') + '</div>') + '</div>';
    if (pf.length) {
      const pRows = pf.filter(function (x) { return hit(x && (x.memory || x.text)); }).slice(-20).map(function (x) {
        return '<div class="wa-item"><b>' + esc((x && x.name) || '?') + '</b> <span class="wa-dim">' + esc(_msTs(x && x.at)) + '</span><div class="wa-dim">' + esc(String((x && (x.memory || x.text)) || '').slice(0, 160)) + '</div></div>';
      });
      out += '<div class="wa-sec">个人主观记忆（' + pf.length + '）</div><div class="wa-list">' + (pRows.join('') || '<div class="wa-empty">无匹配</div>') + '</div>';
    }
    const cRows = chron.filter(function (c) { return hit(c && c.title) || hit(c && c.summary); }).slice(-40).reverse().map(function (c) {
      return '<div class="wa-item wa-dim">' + esc(c.title || '') + ' — ' + esc(String(c.summary || '').slice(0, 100))
        + ' <span class="wa-dim">' + esc(_msTs(c.at)) + '</span> ' + _msRefBadge(c.refs) + '</div>';
    });
    out += '<div class="wa-sec">编年史（' + chron.length + '，示最近 40）</div><div class="wa-list">' + (cRows.join('') || '<div class="wa-empty">' + (chron.length ? '无匹配' : '暂无纪事') + '</div>') + '</div>';
    out += '<div class="wa-sec">溯源审计<span class="wa-dim">（记忆条目 <-> 原始楼层，现算现验）</span></div>';
    out += (function () {
      try {
        if (!WA.timeline || !WA.timeline.unionRefs || !WA.timeline.auditRefs) return '<div class="wa-empty">溯源引擎未加载</div>';
        const groups = [];
        L0.concat(L1, L2, L3).forEach(function (x) { if (x && x.refs) groups.push(x.refs); });
        fsArr.forEach(function (x) { if (x && x.refs) groups.push(x.refs); });
        pf.forEach(function (x) { if (x && x.refs) groups.push(x.refs); });
        chron.forEach(function (x) { if (x && x.refs) groups.push(x.refs); });
        const merged = WA.timeline.unionRefs(groups);
        const a = WA.timeline.auditRefs(merged);
        const n = (a.refs || []).length;
        if (!n) return '<div class="wa-item wa-dim">全部记忆条目均无溯源引用（尚未记录来源楼层）</div>';
        return '<div class="wa-item"><b>' + (a.valid ? '全部有效' : '存在失效引用') + '</b>'
          + '<div class="wa-dim">覆盖楼层 ' + a.startLayer + '-' + a.endLayer + '｜引用 ' + n + ' 处'
          + (a.changed && a.changed.length ? '｜<span class="wa-log-warn">正文已变 ' + a.changed.length + '</span>' : '')
          + (a.missing && a.missing.length ? '｜<span class="wa-log-error">楼层缺失 ' + a.missing.length + '</span>' : '') + '</div>'
          + '<div class="wa-dim">「正文已变」= 记忆入库后该楼层被编辑/重掷，记忆已与正文不同源；「楼层缺失」= 引用指向的楼层已不存在。</div>'
          + _msRefToggle('ALL', merged) + '</div>';
      } catch (e) { return '<div class="wa-empty">溯源审计失败（' + esc(e && e.message) + '）</div>'; }
    })();
    out += '<div id="wa-mem-out" class="wa-out"></div>';
    return out;
  }

  function renderEnemies() {
    const s = WA.store.get();
    const ev = s.evolution || {};
    const enemies = ev.enemies || [];
    const trends = ev.worldTrends || [];
    const bb = ev.blackbox || {};
    const actions = bb.secretActions || [];
    const assets = bb.secretAssets || [];
    const active = enemies.filter(function (e) { return e && e.status !== '已终结'; });
    const terminated = enemies.filter(function (e) { return e && e.status === '已终结'; });
    const activeTrends = trends.filter(function (t) { return t && t.status !== '已结束'; });
    const ES_BADGE = { '追踪中': 'wa-vis-trace', '策划中': 'wa-vis-public', '执行中': 'wa-on', '已终结': '' };
    const AT_BADGE = { '有效': 'wa-on', '过期': 'wa-vis-hidden', '暴露': 'wa-vis-trace', '失效': '' };
    let out = '';
    out += '<div class="wa-stat-grid">'
      + '<div class="wa-stat"><div class="wa-stat-v">' + active.length + '</div><div class="wa-stat-k">活跃仇敌</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + terminated.length + '</div><div class="wa-stat-k">已终结</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + activeTrends.length + '</div><div class="wa-stat-k">天下大势</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + assets.length + '</div><div class="wa-stat-k">隐秘资产</div></div>'
      + '</div>';
    const aRows = active.map(function (e, i) {
      const gi = enemies.indexOf(e);
      return '<div class="wa-item"><b>' + esc(e.name) + '</b> <span class="wa-badge ' + (ES_BADGE[e.status] || '') + '">' + esc(e.status || '?') + '</span>'
        + ' <span class="wa-dim">' + esc(e.type || 'grudge') + '｜R' + esc(String(e.createdRound || '?')) + '</span>'
        + (e.reason ? '<div class="wa-dim">' + esc(String(e.reason).slice(0, 120)) + '</div>' : '')
        + ' <button class="wa-btn wa-mini" data-ensel="' + gi + '" title="推进状态：追踪中→策划中→执行中→已终结">⏩</button></div>';
    });
    out += '<div class="wa-sec">活跃仇敌（' + active.length + '）</div>'
      + '<div class="wa-list">' + (aRows.join('') || '<div class="wa-empty">暂无活跃仇敌（随推演自动产生）</div>') + '</div>';
    if (terminated.length) {
      const tRows = terminated.slice(-10).map(function (e) {
        return '<div class="wa-item wa-dim"><b>' + esc(e.name) + '</b> <span class="wa-badge">已终结</span> R' + esc(String(e.terminatedRound || '?')) + '</div>';
      });
      out += '<div class="wa-sec">已终结（' + terminated.length + '，示最近 10）</div><div class="wa-list">' + tRows.join('') + '</div>';
    }
    if (activeTrends.length) {
      const wRows = activeTrends.map(function (t) {
        return '<div class="wa-item"><b>' + esc(t.name) + '</b> <span class="wa-badge">' + esc(t.status || '持续中') + '</span>'
          + (t.scope ? ' <span class="wa-dim">' + esc(t.scope) + '</span>' : '')
          + (t.description ? '<div class="wa-dim">' + esc(String(t.description).slice(0, 100)) + '</div>' : '')
          + ' <button class="wa-btn wa-mini" data-wtdel="' + trends.indexOf(t) + '" title="结束该大势">止</button></div>';
      });
      out += '<div class="wa-sec">天下大势（' + activeTrends.length + '）</div><div class="wa-list">' + wRows.join('') + '</div>';
    }
    if (assets.length) {
      const sRows = assets.map(function (a) {
        return '<div class="wa-item"><b>' + esc(a.name) + '</b> <span class="wa-badge ' + (AT_BADGE[a.status] || '') + '">' + esc(a.status || '?') + '</span>'
          + ' <span class="wa-dim">暴露度 ' + esc(String(a.exposure || 0)) + '%</span></div>';
      });
      out += '<div class="wa-sec">隐秘资产（' + assets.length + '）</div><div class="wa-list">' + sRows.join('') + '</div>';
    }
    if (actions.length) {
      const xRows = actions.slice(-8).map(function (a) {
        return '<div class="wa-item wa-dim">' + esc(String(a.action).slice(0, 80)) + ' <span class="wa-dim">' + esc(String(a.witnesses || '').slice(0, 30)) + '｜' + esc(_msTs(a.at)) + '</span></div>';
      });
      out += '<div class="wa-sec">隐秘行动（' + actions.length + '，示最近 8）</div><div class="wa-list">' + xRows.join('') + '</div>';
    }
    out += '<div id="wa-en-out" class="wa-out"></div>';
    // v2.64.0: 丢弃归因行——本模块的否定式边界全在**丢弃**上，被丢掉的条目当然不落盘，
    //   于是「上游推了一条没有名字的仇敌 / 一条没有名称的资产」此前在面板上完全不可见
    //   （只能看到仇敌少了一个，答不出为什么少）。此处只**读** dropStat，如实显示：
    //   丢弃原因分布 + 实际入账量。两者必须并排——只报丢弃不报入账，用户会以为入账也坏了。
    if (WA.enemies && typeof WA.enemies.dropStat === 'function') {
      const __ds = WA.enemies.dropStat();
      const __dk = (__ds.dropKinds || []).map(function (k) { return k + '×' + __ds.dropped[k]; }).join(' · ');
      const __ap = __ds.applied || {};
      out += '<div class="wa-dim">丢弃归因：' + (__dk ? esc(__dk) : '无') + '；入账 仇敌' + (__ap.enemies || 0)
        + '/行动' + (__ap.actions || 0) + '/资产' + (__ap.assets || 0) + '/大势' + (__ap.trends || 0)
        + (__ds.lastDropped ? ' · 最近丢弃：' + esc(__ds.lastDropped) : '') + '</div>';
    }
    return out;
}
  // v2.34.0: 平行世界页（主线之外的独立推演：NPC档案/关系网/事件模块 + 推进控制）
  function renderParallelWorld() {
    const s = WA.store.get();
    const pw = s.parallelWorld || { clock: '', npcs: [], relations: [], modules: [], round: 0 };
    const cfg = (WA.parallelWorld && typeof WA.parallelWorld.effectiveSettings === 'function') ? WA.parallelWorld.effectiveSettings() : { enabled: false, autoMode: 'manual', autoInterval: 5, diceEnabled: false, detailLevel: 'normal' };
    const st = (WA.parallelWorld && typeof WA.parallelWorld.stat === 'function') ? WA.parallelWorld.stat() : { advances: 0, failed: 0 };
    const npcs = pw.npcs || [];
    const rels = pw.relations || [];
    const mods = pw.modules || [];
    const IMPACTS = (WA.parallelWorld && WA.parallelWorld.IMPACTS) || ['none', 'low', 'mid', 'high', 'critical'];
    const IL = (WA.parallelWorld && WA.parallelWorld.IMPACT_LABEL) || {};
    const hot = mods.filter(function (m) { return IMPACTS.indexOf(m.impact_level) >= IMPACTS.indexOf('high'); });
    let out = '';
    out += '<div class="wa-stat-grid">'
      + '<div class="wa-stat"><div class="wa-stat-v">' + npcs.length + '</div><div class="wa-stat-k">平行NPC</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + mods.length + '</div><div class="wa-stat-k">平行事件</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + hot.length + '</div><div class="wa-stat-k">高影响（将注入）</div></div>'
      + '<div class="wa-stat"><div class="wa-stat-v">' + (pw.round || 0) + '</div><div class="wa-stat-k">推进轮次</div></div>'
      + '</div>';
    // 控制区
    out += '<div class="wa-sec">推演控制</div>'
      + '<div class="wa-row"><label class="wa-node"><input type="checkbox" id="wa-pw-enable" ' + (cfg.enabled ? 'checked' : '') + '><span class="wa-node-label">启用平行世界</span></label>'
      + ' <select id="wa-pw-mode" class="wa-input wa-w60"><option value="manual"' + (cfg.autoMode === 'manual' ? ' selected' : '') + '>手动</option><option value="per_turn"' + (cfg.autoMode === 'per_turn' ? ' selected' : '') + '>每轮推进</option><option value="every_n"' + (cfg.autoMode === 'every_n' ? ' selected' : '') + '>每N轮</option><option value="dice"' + (cfg.autoMode === 'dice' ? ' selected' : '') + '>骰子（1/6）</option></select>'
      + ' <input type="number" id="wa-pw-int" class="wa-input wa-w60" min="1" max="50" value="' + cfg.autoInterval + '" title="每N轮推进的N" disabled>'
      + ' <label class="wa-node"><input type="checkbox" id="wa-pw-dice" ' + (cfg.diceEnabled ? 'checked' : '') + '><span class="wa-node-label">骰子</span></label>'
      + ' <select id="wa-pw-detail" class="wa-input wa-w60"><option value="brief"' + (cfg.detailLevel === 'brief' ? ' selected' : '') + '>简</option><option value="normal"' + (cfg.detailLevel === 'normal' ? ' selected' : '') + '>中</option><option value="rich"' + (cfg.detailLevel === 'rich' ? ' selected' : '') + '>丰</option></select>'
      + ' <button class="wa-btn wa-mini" id="wa-pw-save">存</button></div>'
      + '<div class="wa-row"><button class="wa-btn" id="wa-pw-advance" ' + (cfg.enabled ? '' : 'disabled') + ' title="调用推演器跑一轮（走 inference 通道）">▶ 手动推进一轮</button>'
      + ' <button class="wa-btn wa-mini" id="wa-pw-prompt" title="预览推进提示词（含六大审查协议）">提示词</button>'
      + ' <button class="wa-btn wa-mini" id="wa-pw-block" title="预览当前会注入主线的平行世界块">注入块</button></div>'
      + '<div class="wa-dim">推进 ' + st.advances + ' 次 / 失败 ' + st.failed + ' 次' + (st.lastErr ? ' · 最近失败：' + esc(String(st.lastErr).slice(0, 80)) : '') + '</div>';
    if (pw.clock) out += '<div class="wa-kv"><span>世界时间锚</span><b>' + esc(pw.clock) + '</b></div>';
    // NPC 档案
    const nRows = npcs.slice(-12).reverse().map(function (n) {
      const gi = npcs.indexOf(n);
      const kb = Object.keys(n.knowledge || {}).filter(function (k) { return n.knowledge[k]; }).map(function (k) { return k + ':' + String(n.knowledge[k]).slice(0, 30); });
      return '<div class="wa-item"><b>' + esc(n.name) + '</b> <span class="wa-dim">情绪' + esc(String(n.emotionLevel != null ? n.emotionLevel : '?')) + '/态度' + esc(String(n.attitudeLevel != null ? n.attitudeLevel : '?')) + '</span>'
        + (n.CURRENT_THOUGHT ? '<div class="wa-dim">想法：' + esc(String(n.CURRENT_THOUGHT).slice(0, 80)) + '</div>' : '')
        + ((n.SHORT_TERM_GOAL || n.LONG_TERM_GOAL) ? '<div class="wa-dim">目标：' + esc(String(n.SHORT_TERM_GOAL || '').slice(0, 30)) + (n.LONG_TERM_GOAL ? ' → ' + esc(String(n.LONG_TERM_GOAL).slice(0, 30)) : '') + '</div>' : '')
        + (kb.length ? '<div class="wa-dim">认知：' + esc(kb.join('；').slice(0, 120)) + '</div>' : '')
        + ' <button class="wa-btn wa-mini" data-pwnrm="' + gi + '" title="移除该NPC档案（连带关系边）">✕</button></div>';
    });
    out += '<div class="wa-sec">平行NPC档案（' + npcs.length + '，示最近 12）</div>'
      + '<div class="wa-list">' + (nRows.join('') || '<div class="wa-empty">暂无档案——手动录入或推进一轮自动生成</div>') + '</div>'
      + '<div class="wa-row"><input type="text" id="wa-pw-npc-name" class="wa-input" placeholder="NPC姓名" maxlength="24">'
      + ' <input type="text" id="wa-pw-npc-goal" class="wa-input" placeholder="当前想法/目标（可选）" maxlength="120">'
      + ' <button class="wa-btn wa-mini" id="wa-pw-npc-add">+ NPC</button></div>';
    // 关系网
    if (rels.length) {
      const rRows = rels.slice(-20).reverse().map(function (r) {
        return '<div class="wa-item wa-dim">' + esc(r.from) + ' → ' + esc(r.to) + ' <span class="wa-badge">' + esc(r.type || '无') + '</span></div>';
      });
      out += '<div class="wa-sec">关系网（' + rels.length + '，示最近 20）</div><div class="wa-list">' + rRows.join('') + '</div>';
    }
    // 事件模块
    const mRows = mods.slice(-10).reverse().map(function (m) {
      const gi = mods.indexOf(m);
      const hotNow = IMPACTS.indexOf(m.impact_level) >= IMPACTS.indexOf('high');
      return '<div class="wa-item"><b>' + esc(m.title) + '</b> <span class="wa-badge ' + (hotNow ? 'wa-on' : '') + '">' + esc(IL[m.impact_level] || m.impact_level) + (hotNow ? '·注入' : '') + '</span>'
        + (m.perspective ? ' <span class="wa-dim">[' + esc(m.perspective) + ']</span>' : '')
        + (m.detail ? '<div class="wa-dim">' + esc(String(m.detail).slice(0, 100)) + '</div>' : '')
        + ' <button class="wa-btn wa-mini" data-pwmod="' + gi + '" title="丢弃该平行事件">✕</button></div>';
    });
    out += '<div class="wa-sec">平行事件（' + mods.length + '，示最近 10）</div>'
      + '<div class="wa-list">' + (mRows.join('') || '<div class="wa-empty">暂无平行事件（推进一轮生成）</div>') + '</div>';
    // v2.35.0: 平行世界子树快照（与工具页全量 toolSnapshot 区分：只序列化 parallelWorld 核心，不含 settings）
    const snaps = (WA.parallelWorld && typeof WA.parallelWorld.listSnapshots === 'function') ? WA.parallelWorld.listSnapshots() : (pw.snapshots || []);
    const sRows = (snaps || []).slice().reverse().map(function (sp) {
      return '<div class="wa-item"><b>' + esc(sp.label || sp.id) + '</b> <span class="wa-dim">第' + esc(String(sp.round || 0)) + '轮' + (sp.clock ? ' · ' + esc(sp.clock) : '') + '</span>'
        + ' <button class="wa-btn wa-mini" data-pwsnap-restore="' + esc(sp.id) + '">恢复</button>'
        + ' <button class="wa-btn wa-mini" data-pwsnap-drop="' + esc(sp.id) + '">✕</button></div>';
    }).join('');
    out += '<div class="wa-sec">平行世界快照（' + (snaps || []).length + '）</div>'
      + '<div class="wa-row"><input type="text" id="wa-pw-snap-label" class="wa-input" placeholder="快照名（可空=按轮次）" maxlength="40">'
      + ' <button class="wa-btn wa-mini" id="wa-pw-snap-save" title="保存当前平行世界子树（NPC/关系/事件/时间锚/轮次）">保存快照</button></div>'
      + '<div class="wa-list">' + (sRows || '<div class="wa-empty">暂无快照</div>') + '</div>';
    out += '<div id="wa-pw-out" class="wa-out"></div>';
    return out;
  }
  function renderInject() {
    const vis = (function () { try { return WA.render.getVisibility(); } catch (e) { return {}; } })();
    const SOURCES = (WA.render && WA.render.SOURCES) || [];
    const NAMES = VIS_NAMES;   // v2.51.0: 单一真源（此前是本函数内的局部手写表，与导演页各一份）
    let out = '';
    out += '<div class="wa-sec">本轮注入落地<span class="wa-dim">（世界状态到底进没进最终 prompt）</span></div>';
    out += (function () {
      try {
        if (!WA.injectInspector || !WA.injectInspector.getLastSnapshot) return '<div class="wa-empty">注入自检引擎未加载</div>';
        const snap = WA.injectInspector.getLastSnapshot();
        if (!snap) return '<div class="wa-item wa-dim">尚无可讲的注入记录——先推演一轮，再回来看。</div>';
        const txt = WA.injectInspector.statusText(snap.status, snap.scope);
        const lv = snap.landed ? 'wa-on' : '';
        const rows = [];
        rows.push('<div class="wa-kv"><span>判定</span><b class="wa-badge ' + lv + '">' + esc(txt) + '</b></div>');
        if (snap.apiType) rows.push('<div class="wa-kv"><span>通道</span><b>' + esc(snap.apiType) + '</b></div>');
        if (snap.ourIndex != null) rows.push('<div class="wa-kv"><span>命中位置</span><b>' + esc(String(snap.ourIndex)) + '</b></div>');
        if (snap.ourContentLen != null) rows.push('<div class="wa-kv"><span>注入长度</span><b>' + esc(String(snap.ourContentLen)) + ' 字符</b></div>');
        if (snap.messageCount != null) rows.push('<div class="wa-kv"><span>消息数</span><b>' + esc(String(snap.messageCount)) + '</b></div>');
        if (snap.promptLength != null) rows.push('<div class="wa-kv"><span>prompt 长度</span><b>' + esc(String(snap.promptLength)) + '</b></div>');
        rows.push('<div class="wa-kv"><span>时间</span><b>' + esc(_msTs(snap.at)) + '</b></div>');
        return '<div class="wa-item">' + rows.join('') + '</div>';
      } catch (e) { return '<div class="wa-empty">读取注入快照失败（' + esc(e && e.message) + '）</div>'; }
    })();
    out += '<div class="wa-sec">注入预算裁决</div>';
    out += (function () {
      try {
        const li = (WA.store.get().lastInjection) || null;
        if (!li) return '<div class="wa-item wa-dim">尚未发生注入；推演一轮后此处显示预算用量与折叠/丢弃明细。</div>';
        if (!li.budget) return '<div class="wa-item wa-dim">上次注入未受预算约束（预算=0 不限，或无可裁项）。</div>';
        const b = li.budget;
        let h = '<div class="wa-item"><b>' + esc(b.used + '/' + b.cap + 't') + '</b>'
          + '<div class="wa-kv"><span>预算来源</span><b>' + esc(b.source || '?') + (b.contextSize ? '（上下文 ' + esc(String(b.contextSize)) + '）' : '') + '</b></div>'
          + '<div class="wa-kv"><span>保留项</span><b>' + esc(String(b.keptCount == null ? '?' : b.keptCount)) + '</b></div>'
          + (b.overBudget ? '<div class="wa-dim wa-log-warn">超出预算（pinned 保底项不可裁）</div>' : '');
        if ((b.folded || []).length) h += '<div class="wa-dim">折叠 ' + (b.folded || []).map(function (f) { return esc(f.source) + '(' + esc(f.reason || '') + ')'; }).join('、') + '</div>';
        if ((b.dropped || []).length) h += '<div class="wa-dim wa-log-warn">丢弃 ' + (b.dropped || []).map(function (f) { return esc(f.source) + '(' + esc(f.reason || '') + ')' + (f.tokens ? ' ' + esc(String(f.tokens)) + 't' : ''); }).join('、') + '</div>';
        h += '</div>';
        return h;
      } catch (e) { return '<div class="wa-empty">读取预算快照失败（' + esc(e && e.message) + '）</div>'; }
    })();
    out += '<div class="wa-sec">槽位落地<span class="wa-dim">（剧情约束类注入的独立分槽）</span></div>';
    out += (function () {
      try {
        const li = (WA.store.get().lastInjection) || null;
        const slots = li && li.slots;
        const errs = li && li.slotErrors;
        let h = '';
        // v2.48.0: 「没有槽位快照」不再等同于「全部并入主块」。部分失败轮（旧版写不出快照，
        //   新版才修）与「压根没启用路由」是两回事：前者有失败、有回退、有幽灵注入风险，
        //   面板却照旧宣称「全部并入主块」——用户据此以为一切正常。有失败就必须明说现场缺失。
        if (!slots || !slots.count) {
          if (errs && errs.length) {
            h += '<div class="wa-item wa-log-error"><b>槽位路由部分失败且未留快照</b>'
              + '<div class="wa-dim">失败的 ' + esc(String(errs.length)) + ' 路已回退主块；'
              + '本轮哪些真落地、哪些未落地无法回答（旧版「计划=落地才写快照」导致的证据缺失）。'
              + '受影响：' + errs.map(function (e) { return esc((e && e.slot) || '?'); }).join('、') + '</div></div>';
          } else {
            h += '<div class="wa-item wa-dim">上次注入无独立槽位（全部并入主块）</div>';
          }
        }
        else {
          // v2.48.0: 三数必须同时在场——「计划 N / 落地 M / 失败 N-M」。
          //   此前只显示计划数，用户无法判断这一轮到底有没有槽位被回退（部分成功被当成整体成功）。
          const landedN = Array.isArray(slots.landed) ? slots.landed.length : null;
          const failedN = Array.isArray(slots.failed) ? slots.failed.length : null;
          h += '<div class="wa-item"><b>' + esc(String(slots.count)) + ' 路槽位</b>｜合计 ' + esc(String(slots.totalChars || 0)) + ' 字符';
          if (landedN !== null || failedN !== null) {
            h += '｜<span class="' + ((failedN && failedN > 0) ? 'wa-log-warn' : 'wa-dim') + '">落地 '
              + esc(String(landedN === null ? (slots.applied || 0) : landedN)) + ' / 失败 '
              + esc(String(failedN === null ? Math.max(0, slots.count - (slots.applied || 0)) : failedN)) + '</span>';
          }
          h += '<div class="wa-dim">' + ((slots.keys || []).map(function (k) { return esc(k); }).join('、') || '—') + '</div>';
          if (Array.isArray(slots.landed) && slots.landed.length && slots.landed.length !== (slots.keys || []).length) {
            h += '<div class="wa-dim">真落地：' + slots.landed.map(function (k) { return esc(k); }).join('、') + '</div>';
            const fellBack = (slots.keys || []).filter(function (k) { return slots.landed.indexOf(k) < 0; });
            if (fellBack.length) h += '<div class="wa-dim wa-log-warn">已回退主块（不重复注入）：' + fellBack.map(function (k) { return esc(k); }).join('、') + '</div>';
          }
          // v2.47.0: perSlot 的真实形状是**数组**（injectSlotAudit.snapshotSlots 产出），
          //   而这里此前按对象 map 遍历（Object.keys 拿到 "0"/"1"），于是每个槽位都渲染成
          //   「0：0 项｜0 字符」——用户看到的是「槽位一个项都没有」，与快照事实相反。
          //   现在两种形状都吃（数组优先，对象为旧存档兼容），并显示每槽的源与项数。
          const ps = slots.perSlot;
          const psList = Array.isArray(ps) ? ps
            : (ps && typeof ps === 'object' ? Object.keys(ps).map(function (k) {
                const v = ps[k] || {};
                return { slot: k, chars: v.chars, itemCount: v.count, sources: v.sources };
              }) : []);
          psList.forEach(function (s) {
            h += '<div class="wa-dim">' + esc(s.slot) + '：' + esc(String(s.itemCount || 0)) + ' 项｜' + esc(String(s.chars || 0)) + ' 字符'
              + (s.sources && s.sources.length ? '｜' + s.sources.map(function (x) { return esc(x); }).join('/') : '') + '</div>';
          });
          h += '</div>';
        }
        if (errs && errs.length) h += '<div class="wa-dim wa-log-error">槽位落地报错 ' + errs.length + ' 处</div>';
        return h;
      } catch (e) { return '<div class="wa-empty">读取槽位快照失败（' + esc(e && e.message) + '）</div>'; }
    })();
    // v2.49.0（第三十四面）：**主块自身的账**。
    //   为什么面板必须有它：此前主块是整条注入链上**唯一没有独立账的一环**——
    //   预算账单记「折叠/丢弃」、槽位快照记「哪几路落地」、去向账记「每一项去哪」，
    //   而主块本身（上一轮 prompt 里我们实际拼了多少字、由哪些源拼成）无人可答。
    //   store.lastInjection 里的 len / sources 自 v0.2.1 起就每轮写入，却**全库零读点**。
    //   后果不是崩溃，而是「主块 0 字」这句结论**无法区分两种局面**：
    //     · 本轮全部经独立槽位落地（约束已生效，正常）；
    //     · 本轮确实没有可注入内容（什么都没进 prompt）。
    out += '<div class="wa-sec">主块账<span class="wa-dim">（上一轮 prompt 里我们实际拼了多少字、由哪些源拼成）</span></div>';
    out += (function () {
      try {
        const li = (WA.store.get().lastInjection) || null;
        if (!li) return '<div class="wa-item wa-dim">尚未发生注入；推演一轮后此处显示主块字数与来源。</div>';
        const len = li.len | 0;
        const srcs = Array.isArray(li.sources) ? li.sources : [];
        const slotLanded = !!(li.slots && li.slots.applied > 0);
        let h = '<div class="wa-item"><b>' + esc(String(len)) + ' 字符</b>｜'
          + esc(String(srcs.length)) + ' 个来源';
        if (!srcs.length) {
          h += '<div class="wa-dim">' + (len ? '来源未登记（有内容却无来源名——记账断裂）' : '无来源（主块为空）') + '</div>';
        } else {
          h += '<div class="wa-dim">' + srcs.map(function (x) { return esc(x); }).join('、') + '</div>';
        }
        // 「主块 0 字」必须当场说清是哪种局面（这是本区块存在的核心理由）
        if (len === 0) {
          h += slotLanded
            ? '<div class="wa-dim">本轮全部经独立槽位落地——约束类注入已生效，不是「没注入」</div>'
            : '<div class="wa-dim wa-log-warn">本轮确实没有可注入内容（主块与槽位都没有产出）</div>';
        }
        // 重复注入：同一来源既进槽位又进主块（v2.49.0 落实了 audit 里那个空分支）
        try {
          const a = (WA.injectSlotAudit && WA.injectSlotAudit.audit) ? WA.injectSlotAudit.audit(li) : null;
          const dups = (a && a.issues ? a.issues : []).filter(function (x) { return x.code === 'slot.mainDuplicate'; });
          if (dups.length) h += '<div class="wa-dim wa-log-error">' + dups.map(function (x) { return esc(x.detail); }).join('；') + '</div>';
        } catch (e2) {}
        h += '</div>';
        return h;
      } catch (e) { return '<div class="wa-empty">读取主块账失败（' + esc(e && e.message) + '）</div>'; }
    })();
    // v2.47.0: 注入项去向（第三十二面）——每个候选项最后去了哪里，逐项可答。
    //   为什么面板必须看它：此前能显示的只有三张互不相通的账（预算账单按 source 名、
    //   槽位快照只有 slot 与字数、主块是一个拼好的字符串），于是「正文里少了那条约束」
    //   在界面上**无法回答**：它可能是被折叠、被丢弃、进了别的槽位，或者根本没生成。
    //   这里按输入位置列出每一项的去向，并用合计与候选项数对账（数不上就是有项静默消失）。
    out += '<div class="wa-sec">注入项去向<span class="wa-dim">（每个候选项最后落在哪）</span></div>';
    out += (function () {
      try {
        const li = (WA.store.get().lastInjection) || null;
        if (!li) return '<div class="wa-item wa-dim">尚无注入记录。</div>';
        const tr = Array.isArray(li.trace) ? li.trace : null;
        if (!tr) return '<div class="wa-item wa-dim">上次注入未记录去向（旧存档快照）。</div>';
        const TO_LABEL = { main: '主块', slot: '独立槽位', folded: '已折叠', dropped: '已丢弃', empty: '空内容' };
        const sum = li.traceSummary || {};
        let h = '<div class="wa-item"><b>' + esc(String(tr.length)) + ' 项候选</b>';
        h += '<div class="wa-kv"><span>去向</span><b>'
          + ['main', 'slot', 'folded', 'dropped', 'empty'].map(function (k) {
              const n = sum[k] || 0;
              return (n ? '<span class="wa-tag">' + esc(TO_LABEL[k]) + ' ' + esc(String(n)) + '</span>' : '');
            }).join('') + '</b></div>';
        h += '<div class="wa-dim">' + tr.map(function (t) {
          const tail = t.to === 'slot' ? '→' + esc(String(t.slot)) 
            : (t.to === 'folded' ? '(' + esc(String(t.reason || '')) + ')'
            : (t.to === 'dropped' ? '(' + esc(String(t.reason || '')) + (t.tokens ? ' ' + esc(String(t.tokens)) + 't' : '') + ')'
            : ''));
          return esc(String(t.i)) + '.' + esc(t.source) + '→' + esc(TO_LABEL[t.to] || t.to) + tail;
        }).join('　') + '</div>';
        // 对账：折叠+丢弃+进槽+并主块+空 应当恰好等于候选项数
        const tot = ['main', 'slot', 'folded', 'dropped', 'empty'].reduce(function (a, k) { return a + (sum[k] || 0); }, 0);
        if (tot !== tr.length) h += '<div class="wa-dim wa-log-warn">去向合计 ' + esc(String(tot)) + ' 与候选项数 ' + esc(String(tr.length)) + ' 不符（有项未记账）</div>';
        h += '</div>';
        return h;
      } catch (e) { return '<div class="wa-empty">读取去向账失败（' + esc(e && e.message) + '）</div>'; }
    })();
    const onCount = SOURCES.filter(function (k) { return vis[k]; }).length;
    // v2.50.0（第三十五面）：宿主世界书激活账。
    //   为什么面板必须有它：宿主自己那次世界书扫描注入了哪几条，在本扩展侧此前
    //   **一个字都答不出**（engines/worldbook.js 读的是条目定义，不是「本轮实际注入」）。
    //   用户改不动条目时能拿到的只有「感觉没生效」。此处把三态如实摆出来——
    //   unsupported 说的是「宿主没给这个事件」，**不是**「本轮没有条目激活」。
    out += '<div class="wa-sec">宿主世界书激活账<span class="wa-dim">（宿主自己扫描并注入的条目——本扩展此前完全看不到的那一半）</span></div>';
    out += (function () {
      try {
        if (!WA.hostWbTrace || typeof WA.hostWbTrace.stat !== 'function') return '<div class="wa-empty">宿主世界书激活账未加载</div>';
        const st = WA.hostWbTrace.stat();
        const tone = st.state === 'ok' ? 'wa-log-info' : (st.state === 'shape-unknown' ? 'wa-log-warn' : 'wa-dim');
        let h = '<div class="wa-item"><b>' + esc(String(st.state)) + '</b>'
          + '<div class="' + tone + '">' + esc(WA.hostWbTrace.stateText ? WA.hostWbTrace.stateText() : '') + '</div>';
        if (st.state === 'ok') {
          h += '<div class="wa-dim">本轮 ' + esc(String(st.lastCount | 0)) + ' 条：'
            + esc((st.lastNames || []).slice(0, 8).join('、') || '—') + '</div>';
          if (st.sysExcluded) h += '<div class="wa-dim">另有 ' + esc(String(st.sysExcluded)) + ' 条系统条目按宿主口径排除（显式报出，不静默丢弃）</div>';
        } else if (st.state === 'shape-unknown') {
          h += '<div class="wa-dim">载荷键名：' + esc((st.shapeUnknownKeys || []).join('、') || '?') + '——已拒绝猜字段名</div>';
        }
        if (st.rounds) h += '<div class="wa-dim">跨轮窗口 ' + esc(String(st.rounds)) + ' 轮</div>';
        h += '</div>';
        return h;
      } catch (e) { return '<div class="wa-empty">读取宿主世界书激活账失败（' + esc(e && e.message) + '）</div>'; }
    })();
    // v2.50.0（第三十五面）：楼层变更联动账。
    //   「有判据、无处置」是这一块此前的全部形态：timeline.auditRefs 早就算得出 missing，
    //   面板却只多两条 warn，没人回收。此处把「哪一条引用着已删楼层」摊开，并出**处置计划**
    //   （只读，不执行——回收会不可逆地删掉用户的世界）；同时把与 settleGuard 的对账结论摆出来，
    //   因为两套口径不一致时，用户必须知道「谁说的才算数」得由他自己判断。
    out += '<div class="wa-sec">楼层变更联动账<span class="wa-dim">（删楼/改楼后，哪些派生数据还指着旧楼层）</span></div>';
    out += (function () {
      try {
        if (!WA.floorChanges || typeof WA.floorChanges.plan !== 'function') return '<div class="wa-empty">楼层变更联动账未加载</div>';
        const p = WA.floorChanges.plan();
        const gv = (p.guard || {}).verdict;
        const warn = (p.missing || []).length > 0 || gv === 'divergent' || gv === 'guard-blind';
        let h = '<div class="wa-item"><b>' + esc(WA.floorChanges.stateText ? WA.floorChanges.stateText() : p.state) + '</b>';
        h += '<div class="wa-dim">盘点 ' + esc(String((p.scanned || {}).sites | 0)) + ' 处引用面 · 有效引用 '
          + esc(String((p.scanned || {}).refs | 0)) + ' 个 · 继承跳过 ' + esc(String((p.scanned || {}).inherited | 0)) + '</div>';
        if ((p.missing || []).length) {
          h += '<div class="wa-log-warn">' + (p.missing || []).map(function (m) {
            return esc(m.where) + (m.label ? '「' + esc(m.label) + '」' : '') + ' → ' + esc(String(m.count)) + ' 个引用指向已删楼层'
              + ((m.floors || []).length ? '（楼层 ' + esc((m.floors || []).join('/')) + '）' : '');
          }).join('<br>') + '</div>';
        }
        if ((p.changed || []).length) {
          h += '<div class="wa-dim">另 ' + esc(String((p.changed || []).length)) + ' 处所依据内容被编辑/重roll（摘要/事实可能已过时）</div>';
        }
        h += '<div class="wa-dim' + (warn ? ' wa-log-warn' : '') + '">与结算守卫对账：' + esc(String(gv || '?')) + ' — ' + esc(String((p.guard || {}).note || '')) + '</div>';
        h += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-fc-plan">出处置计划</button>'
          + '<button class="wa-btn wa-mini" id="wa-fc-reset">清空变更窗口</button></div>';
        h += '<div class="wa-dim">本面板**不提供自动回收**：回收会不可逆地删掉用户的世界，故只出计划（needConfirm）留给人工判断。</div>';
        h += '</div>';
        return h;
      } catch (e) { return '<div class="wa-empty">读取楼层变更联动账失败（' + esc(e && e.message) + '）</div>'; }
    })();
    // v2.50.0（第三十五面）：台账时间轴。
    //   单值 lastAt 的结构性盲区：「每轮都在失败」与「刚失败一次」在面板上完全同形。
    //   本区块给出「本窗口内是否新增失败」（failing）与「连续同态几次」（stalled，中性）。
    out += '<div class="wa-sec">台账时间轴<span class="wa-dim">（把「最近一次」变成「最近 N 次」——区分持续故障与偶发一次）</span></div>';
    out += (function () {
      try {
        if (!WA.ledgerTimeline || typeof WA.ledgerTimeline.stat !== 'function') return '<div class="wa-empty">台账时间轴未加载</div>';
        const st = WA.ledgerTimeline.stat();
        let h = '<div class="wa-item"><b>' + esc(String(st.sites || 0)) + '</b> 个站点在被观测'
          + '<div class="wa-dim">' + esc(WA.ledgerTimeline.summaryText ? WA.ledgerTimeline.summaryText() : '') + '</div>';
        if ((st.failing || []).length) h += '<div class="wa-log-warn">本窗口内新增失败：' + esc((st.failing || []).join('、')) + '</div>';
        if ((st.stalled || []).length) h += '<div class="wa-dim">连续同态 ' + esc(String((st.stalled || []).length)) + ' 站（中性结论：可能是稳定，也可能是停摆）</div>';
        h += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-lt-refresh">立即采样</button>'
          + '<button class="wa-btn wa-mini" id="wa-lt-reset">清空窗口</button></div></div>';
        return h;
      } catch (e) { return '<div class="wa-empty">读取台账时间轴失败（' + esc(e && e.message) + '）</div>'; }
    })();
    out += '<div class="wa-sec">注入可见性（' + onCount + '/' + SOURCES.length + ' 开）</div>'
      + '<div class="wa-item">' + SOURCES.map(function (k) { return '<span class="wa-tag">' + esc(NAMES[k] || k) + (vis[k] ? '' : '关') + '</span>'; }).join('')
      + '<div class="wa-dim">开关在「导演」页调整。</div></div>';
    // v2.45.0: 条目按需路由（缝合 cultivation-rule-router）
    //   为什么面板必须看它：候选集和「本回合哪些条目被隐藏」全在引擎内存里，
    //   界面上一片空白时用户无从判断是「路由没跑」还是「跑了一致没隐藏」。
    //   测试用 `R.` 别名引用引擎，产品侧零消费者会让这组导出被判「功能级失效」——
    //   本区块就是它的真实消费方（读候选 / 读最近一轮结果 / 读降级留痕 / 增删候选）。
    out += '<div class="wa-sec">条目按需路由<span class="wa-dim">（本回合哪些常驻条目该上场）</span></div>';
    out += (function () {
      try {
        if (!WA.entryRouter || typeof WA.entryRouter.lastRoute !== 'function') return '<div class="wa-empty">条目路由引擎未加载</div>';
        const cands = WA.entryRouter.listCandidates();
        const rt = WA.entryRouter.lastRoute();
        const fail = WA.entryRouter.lastFailure();
        let h = '<div class="wa-item"><b>' + cands.length + ' 条候选</b>';
        if (!cands.length) h += '<div class="wa-dim">尚无候选——路由不介入（发送前扫描按宿主原样）。在下面加入条目 id 与启用条件。</div>';
        else h += '<div class="wa-dim">' + cands.map(function (c) {
          return esc(c.title || c.id) + (WA.entryRouter.isPassive(c.id) ? '(被动)' : '')
            + ' <button class="wa-mini" data-er-del="' + esc(c.id) + '" title="从候选集移除（不改世界书条目本身）">移除</button>';
        }).join('、') + '</div>';
        if (rt) {
          h += '<div class="wa-kv"><span>最近一轮</span><b>' + esc(String(rt.enabled.length)) + ' 条激活 / ' + esc(String(cands.length - rt.enabled.length)) + ' 条隐藏</b></div>'
            + '<div class="wa-kv"><span>判定时间</span><b>' + esc(_msTs(rt.at)) + '</b></div>';
        } else h += '<div class="wa-dim">尚无路由记录。</div>';
        if (fail) h += '<div class="wa-dim wa-log-warn">上次降级：' + esc(fail.kind + ' — ' + fail.message) + '（本回合不隐藏任何条目）</div>';
        h += '<div class="wa-dim">判据取最近剧情 ' + esc(String(WA.entryRouter.recentMessages(4).length)) + ' 字符</div>';
        h += '</div>';
        return h;
      } catch (e) { return '<div class="wa-empty">读取路由状态失败（' + esc(e && e.message) + '）</div>'; }
    })();
    out += '<div class="wa-row"><input id="wa-er-id" class="wa-input" placeholder="条目 id…"/><input id="wa-er-cond" class="wa-input" placeholder="启用条件（空=不参与路由）…"/><button class="wa-btn" id="wa-er-add" title="把世界书条目加入「按需激活」候选集；条件为空则不参与路由">加入路由</button>'
      + '<button class="wa-btn" id="wa-er-clear" title="清空候选集与结果缓存（不改世界书条目本身）">重置</button></div>'
      + '<div class="wa-row"><input id="wa-er-input" class="wa-input" placeholder="试跑输入（模拟玩家这一句）…"/><button class="wa-btn" id="wa-er-dry" title="只算不写：看这一句会让哪些条目被隐藏，不改任何状态">试跑</button>'
      + '<button class="wa-btn" id="wa-er-apply" title="把最近一轮试跑结果落到 WorldAxis 自己的 off 覆写表（只改覆写、不动用户开关，下一轮自动重写）">应用本轮</button></div>'
      + '<div id="wa-er-out" class="wa-out"></div>';
    // v2.46.0: 变量驱动条款（万花筒）
    //   为什么面板必须看它：派生量与规则全在引擎内存里，且「键没有」与「真值就是 null」
    //   在这里被刻意分成两态——界面上不显示，用户会把「路径写错」看成「世界还没走到」。
    //   本区块是这组导出的**真实产品消费者**（读派生 / 读规则 / 读三态求值 / 读降级留痕 /
    //   增删派生与规则 / 试算），不是仅供测试引用的摆设（v2.45.0 踩过：只由测试引用 ⇒
    //   整组导出被判「功能级失效」）。
    out += '<div class="wa-sec">变量驱动条款<span class="wa-dim">（数值过阈值就换一段正文，不必再手写世界书关键词）</span></div>';
    out += (function () {
      try {
        if (!WA.kaleidoscope || typeof WA.kaleidoscope.evaluate !== 'function') return '<div class="wa-empty">万花筒引擎未加载</div>';
        const ev = WA.kaleidoscope.evaluate();
        const der = WA.kaleidoscope.listDerives();
        const rls = WA.kaleidoscope.listRules();
        const fail = WA.kaleidoscope.lastFailure();
        let h = '<div class="wa-item"><b>' + der.length + ' 个派生量 / ' + rls.length + ' 条规则</b>'
          + '<div class="wa-dim">上限 ' + esc(String(WA.kaleidoscope.MAX_DERIVES)) + ' / ' + esc(String(WA.kaleidoscope.MAX_RULES))
          + '；算子 ' + esc(WA.kaleidoscope.OPS.join(' / ')) + '</div>';
        if (!der.length && !rls.length) h += '<div class="wa-dim">尚未配置——本回合不注入（0 token）。</div>';
        if (der.length) h += '<div class="wa-dim">' + der.map(function (d) {
          return esc(d.id) + '(' + esc(d.op) + ')<button class="wa-mini" data-ka-del="' + esc(d.id) + '" title="删除该派生量">删</button>';
        }).join('、') + '</div>';
        if (rls.length) h += '<div class="wa-dim">' + rls.map(function (r) {
          return esc(r.id) + '<button class="wa-mini" data-ka-rdel="' + esc(r.id) + '" title="删除该规则">删</button>';
        }).join('、') + '</div>';
        // 三态分开显示：ok / missing（路径不存在）/ invalid（规则或取值非法）——绝不同形。
        h += '<div class="wa-kv"><span>命中</span><b>' + ev.hits.length + ' 条</b></div>'
          + '<div class="wa-kv"><span>缺路径</span><b>' + ev.missing.length + ' 个'
          + (ev.missing.length ? '：' + esc(ev.missing.map(function (x) { return x.id; }).join('、')) : '') + '</b></div>'
          + '<div class="wa-kv"><span>非法</span><b>' + ev.invalid.length + ' 个'
          + (ev.invalid.length ? '：' + esc(ev.invalid.map(function (x) { return x.id + '(' + x.reason + ')'; }).join('、')) : '') + '</b></div>';
        if (ev.skipped.length) h += '<div class="wa-dim">条件为假 ' + ev.skipped.length + ' 条：'
          + esc(ev.skipped.map(function (x) { return x.id + '(' + x.reason + ')'; }).join('、')) + '</div>';
        if (ev.unresolved.length) h += '<div class="wa-dim wa-log-warn">占位符未解析（原样保留，不是静默清空）：' + esc(ev.unresolved.join('、')) + '</div>';
        if (fail) h += '<div class="wa-dim wa-log-warn">上次降级：' + esc(fail.kind + ' — ' + fail.message) + '（本回合不注入）</div>';
        h += '</div>';
        return h;
      } catch (e) { return '<div class="wa-empty">读取变量驱动状态失败（' + esc(e && e.message) + '）</div>'; }
    })();
    out += '<div class="wa-row"><input id="wa-ka-id" class="wa-input" placeholder="派生量 id（如 声望档）…"/>'
      + '<input id="wa-ka-path" class="wa-input" placeholder="世界状态路径（如 evolution.reputation.common）…"/>'
      + '<input id="wa-ka-op" class="wa-input wa-num" placeholder="算子 map / range / formula…" value="map"/>'
      + '<button class="wa-btn" id="wa-ka-add" title="新增或覆盖一个派生量；formula 请把表达式填在路径框（如 $a * 2 + 10）">写入派生量</button></div>'
      + '<div class="wa-row"><input id="wa-ka-rule-id" class="wa-input" placeholder="规则 id…"/>'
      + '<input id="wa-ka-rule-when" class="wa-input" placeholder="条件（如 $声望值 &lt; 30 且 $敌意 &gt;= 80，空=恒真）…"/>'
      + '<input id="wa-ka-rule-text" class="wa-input" placeholder="命中后注入的正文（可用占位符引用派生量）…"/>'
      + '<button class="wa-btn" id="wa-ka-rule-add" title="条件命中时把这段正文拼进「变量驱动条款」块">写入规则</button>'
      + '<button class="wa-btn" id="wa-ka-eval" title="只算不写：立刻重算三态并打印本回合会注入的块">试算</button>'
      + '<button class="wa-btn" id="wa-ka-clear" title="清空全部派生量与规则（不改世界状态）">清空</button></div>'
      + '<div id="wa-ka-out" class="wa-out"></div>';
    out += '<div class="wa-sec">注入自检</div>'
      + '<div class="wa-row"><button class="wa-btn" id="wa-inj-refresh" title="重新读取当前注入快照（只读，不改变任何状态）">刷新快照</button>'
      + '<button class="wa-btn" id="wa-inj-diag" title="跳转工具页运行完整自检">去自检</button></div>'
      + '<div id="wa-inj-out" class="wa-out"></div>';
    return out;
  }

  function renderDirector() {
    const vis = WA.render.getVisibility();
    const plan = WA.oracle.plan;
    return `
      <div class="wa-sec">注入可见性（哪些世界信息递给正文）</div>
      ${WA.render.SOURCES.map(k => `<label class="wa-node"><input type="checkbox" data-vis="${k}" ${vis[k] ? 'checked' : ''}/><span class="wa-node-label">${VIS_NAMES[k] || k}</span></label>`).join('')}
      <div class="wa-sec">剧情引导（弧线/序列）</div>
      ${plan ? `<div class="wa-item"><b>${esc(plan.kind === 'arc' ? '弧线' : '序列')}</b> 第${plan.current + 1}/${plan.beats.length}拍<div class="wa-dim">${esc((WA.oracle.currentBeat() || {}).goal || '')}</div><button class="wa-btn wa-mini" id="wa-beat-next" title="推进到剧情弧线的下一拍">完成本拍</button><button class="wa-btn wa-mini" id="wa-plan-clear">放弃</button></div>`
        : `<textarea id="wa-plan-beats" class="wa-ta" placeholder="每行一拍的目标/指令…"></textarea><button class="wa-btn" id="wa-plan-start">开始序列引导</button>`}
      <div class="wa-sec">AI 剧情参谋（judge 通道）</div>
      <div class="wa-row"><input id="wa-or-goal" class="wa-input" placeholder="剧情目标（如「揭开蒙面人身份」）…"/><input id="wa-or-beats" class="wa-input wa-num" type="number" min="1" max="12" value="5"/></div>
      <button class="wa-btn" id="wa-or-gen" title="用 judge 通道把剧情目标展开成多拍弧线">AI 生成弧线</button>
      <div id="wa-or-out" class="wa-out">${(() => {
        // v2.1.0: 参谋留痕（此前 generatePlan 零调用，AI 弧线能力形同虚设）
        if (!WA.oracle || typeof WA.oracle.stat !== 'function') return '';
        const os = WA.oracle.stat();
        const base = '已生成 ' + os.generated + ' 次 / 尝试 ' + os.runs + ' 次';
        const tail = os.lastReason ? ' · 上次失败：' + esc(os.lastReason) : (os.lastCount ? ' · 上次 ' + os.lastCount + ' 拍' : '');
        return '<span class="wa-dim">' + base + tail + '</span>';
      })()}</div>
      <div class="wa-sec">行动选项</div>
      <button class="wa-btn" id="wa-gen-choices" title="基于当前世界状态生成玩家的 4 个可选行动">生成4个行动选项</button>
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
      <input type="range" min="1" max="10" value="${WA.apiRouter.getConcurrency()}" id="wa-conc" class="wa-range" title="同时进行的 AI 请求上限（调高会更快，但可能触发供应商限流）"/>`;
  }

  function renderTools() {
    return `
      <div class="wa-sec">世界态势分析（纯只读体检）</div>
      <button class="wa-btn" id="wa-an-run">立即分析</button>
      <div id="wa-an-out" class="wa-out"></div>
      <div class="wa-sec">状态快照导出 / 恢复</div>
      <div class="wa-row"><button class="wa-btn" id="wa-snap-dl" title="导全量快照（剔除运行期脏字段，可归档/传给别人/跨聊天移植）">导出 JSON</button><button class="wa-btn" id="wa-snap-up" title="从快照文件恢复（先校验格式/schema/字段完整性，通过才写入）">导入 JSON</button><input type="file" id="wa-snap-file" accept=".json" style="display:none"/></div>
      <div class="wa-dim">导出剔除运行时脏字段；导入先校验（格式/schema/字段完整性），通过才写入并自动留恢复点。</div>
      <div id="wa-snap-out" class="wa-out"></div>
      <div class="wa-sec">外部数据导入（自动识别类型）</div>
      <div class="wa-row"><button class="wa-btn" id="wa-imp-pick">选择 JSON 文件</button><input type="file" id="wa-imp-file" accept=".json" style="display:none"/></div>
      <div class="wa-dim">支持：全量存档 / 区域事件 / 势力清单 / 事件链清单 / 人物主观记忆 / 世界书条目组（自动判别）</div>
      <textarea id="wa-imp-text" class="wa-ta" placeholder="或直接粘贴 JSON 内容…"></textarea>
      <button class="wa-btn" id="wa-imp-run" title="自动识别粘贴/文件内容的类型（存档/区域事件/势力/事件链/主观记忆），校验失败零写入">预检并导入</button>
      <div id="wa-imp-out" class="wa-out"></div>
      <div class="wa-sec">扩展自检（模块/注入/UI/运行环境）</div>
      <div class="wa-sec">诊断与体检<span class="wa-dim">（只读，不改世界状态）</span></div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-diag-run" title="立即体检：模块装载/上轮注入/UI 绑定/视图开关/API 通道">立即自检</button>
        <button class="wa-btn" id="wa-diag-dl" title="把体检结果导出为 JSON 诊断包（不含聊天正文与密钥）">导出诊断包</button>
        <button class="wa-btn" id="wa-audit-copy" title="复制内存/持久化用量审计报告">复制内存审计</button>
        <button class="wa-btn" id="wa-maintain" title="健康巡视：逐站点扫描容量、陈旧、孤立数据">健康巡视</button>
      </div>
      <div class="wa-sec">存储与现场<span class="wa-dim">（看磁盘上真实存了什么）</span></div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-key-check" title="存储键体检：列出本扩展写过的所有键与占用">存储键体检</button>
        <button class="wa-btn" id="wa-quar-view" title="隔离现场：读取损坏而被隔离的原始数据">隔离现场</button>
        <button class="wa-btn" id="wa-conf-view" title="冲突现场：多标签页并发写导致的冲突快照">冲突现场</button>
        <button class="wa-btn" id="wa-mirror-view" title="镜像视图：聊天 metadata 镜像与 localStorage 的回落台账">镜像视图</button>
        <button class="wa-btn" id="wa-orphan-view" title="设置键：未登记却已落盘的幽灵设置">设置键</button>
        <button class="wa-btn" id="wa-settle-view" title="结算守卫：同一楼层是否被重复结算">结算守卫</button>
        <button class="wa-btn" id="wa-compat-view" title="宿主兼容层：当前宿主提供了哪些能力、缺哪些">宿主兼容层</button>
      </div>
      <div class="wa-sec">恢复与撤销<span class="wa-dim">（改错了能退回去）</span></div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-recovery-dl" title="导出当前状态的恢复点文件">导出恢复点</button>
        <button class="wa-btn" id="wa-recovery-view" title="列出已留存的恢复点">存档恢复点</button>
        <button class="wa-btn" id="wa-undo-btn" title="回退最近一次面板编辑（参数/背景/事实/伏笔等）">撤销编辑</button>
      </div>
      <div class="wa-sec">记忆采样预览<span class="wa-dim">（buildBlock 实时输出）</span></div>
      <div class="wa-row"><button class="wa-btn" id="wa-samp-preview" title="调用 memorySampler.buildBlock 查看当前会注入的记忆采样文本">预览采样</button><button class="wa-btn wa-mini" id="wa-samp-copy" disabled>复制</button></div>
      <div id="wa-samp-out" class="wa-out"></div>
      <div class="wa-sec">运行痕迹<span class="wa-dim">（只清计量，不动世界状态）</span></div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-stat-reset" title="仅重置各种计数器，世界状态与存档不受影响">清零计量</button>
        <button class="wa-btn" id="wa-wf-reset" title="清空工作流运行历史与失败台账">清空运行痕迹</button>
      </div>
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
      <button class="wa-btn wa-mini" id="wa-log-copy" title="复制当前日志到剪贴板">复制</button>
      <button class="wa-btn wa-mini" id="wa-err-report">复制错误报告</button>
      <div class="wa-logbox">${src.slice(-80).reverse().map(l => `<div class="wa-log wa-log-${l.level}"><span class="wa-dim">${new Date(l.t).toLocaleTimeString()}</span> ${esc(l.msg)}</div>`).join('')}</div>`;
  }

  const RENDERERS = { overview: renderOverview, world: renderWorld, people: renderPeople, memory: renderMemory, enemies: renderEnemies, parallel: renderParallelWorld, inject: renderInject, events: renderEvents, director: renderDirector, connect: renderConnect, tools: renderTools, logs: renderLogs,
    settings: () => WA.uiSettings ? WA.uiSettings.render() : '<div class="wa-empty">设置模块未加载</div>',
    assistant: renderAssistant };

  function renderAssistant() {
    return `
      <div class="wa-sec">世界助手（就世界状态问答，上帝视角）</div>
      <div class="wa-row"><input id="wa-ask-input" class="wa-input" placeholder="问世界/人物/暗流/舆情…"/><button class="wa-btn" id="wa-ask-btn" title="就当前世界状态向助手提问（上帝视角，会提示哪些内容正文角色不该知道）">问</button></div>
      <div id="wa-ask-out" class="wa-out"></div>
      <div class="wa-sec">番外小剧场</div>
      <div class="wa-row"><input id="wa-theater-input" class="wa-input" placeholder="剧场指令（可空）…"/><button class="wa-btn" id="wa-theater-btn" title="生成与主线无关的番外/小剧场文本（不写入世界状态）">生成番外</button></div>
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
    // v2.21.0: 结果出口的**判空写**（与设置页同规格，同一处约定不再各写一份）。
    //   `$('#x')` 每次调用都重新查询；异步出口（观测/档案/弧线/选项目/快照导入）在 `await`
    //   之后才写回，其间任意状态事件都会触发面板重绘、目标节点从树中消失 ⇒ 重查得 null ⇒
    //   写 `textContent` 抛 TypeError（用户视角「点了没反应」）。统一出口 + 判空 = 静默降级为
    //   「本轮结果无处可显」，而不是把 DOM 异常抛进事件循环。
    const setOut = function (sel, text) { const el = $(sel); if (el) el.textContent = text; };
    const setHtml = function (sel, html) { const el = $(sel); if (el) el.innerHTML = html; };
    // v2.21.0: 宿主取文本的**能力守卫**。为什么是缺陷而不是洁癖：
    //   面板在「无头/iframe/被沙箱化」的宿主里可能根本没有 `prompt` 全局（本仓库的 UI 门禁
    //   就是这种环境——tests/ui-gate.js 的 mini-DOM 不注入 prompt）。此前三处直接裸调
    //   `prompt(...)`，点下去就是 `ReferenceError: prompt is not defined`，而这恰恰是**唯一
    //   的入口**（势力编辑器没有别的编辑途径、世界钟没有别的设定途径），能力等于不存在。
    //   守卫把「宿主不支持」变成用户看得见、可归因的一句话。
    const askText = function (msg, dft) {
      try {
        if (typeof mainWin.prompt === 'function') return mainWin.prompt(msg, dft);
        if (typeof prompt === 'function') return prompt(msg, dft);
      } catch (e) { if (WA.log) WA.log('warn', '宿主取文本失败', e); }
      setOut('#wa-diag-out', '宿主不支持输入框（prompt 不可用）—— 该入口在本环境不可用，非配置问题');
      return null;
    };
    panelEl.querySelectorAll('[data-node]').forEach(cb => cb.onchange = () => WA.workflow.setEnabled(cb.dataset.node, cb.checked));
    panelEl.querySelectorAll('[data-vis]').forEach(cb => cb.onchange = () => { WA.render.setVisibility(cb.dataset.vis, cb.checked); });
    panelEl.querySelectorAll('[data-unreg]').forEach(x => x.onclick = () => { WA.registry.unregister(x.dataset.unreg); renderBody(); });
    panelEl.querySelectorAll('[data-observe]').forEach(b => b.onclick = async () => { setOut('#wa-observe-out', '观测中…'); const r = await WA.observe.slice(b.dataset.observe); setOut('#wa-observe-out', r.ok ? r.text : ('失败：' + (r.error && r.error.message || r.reason))); });
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
    // v2.30.0（P0-2）：撤销编辑——弹撤销栈顶、按 path 写回；镜像视图——读侧回落台账。
    on('#wa-undo-btn', () => {
      const r = WA.undo.undo();
      const top = WA.undo.peek();
      const out = $('#wa-diag-out');
      if (out) out.innerHTML = '<div class="wa-log ' + (r.ok ? 'wa-log-info' : 'wa-log-warn') + '">'
        + (r.ok ? '✓ 已撤销：' + r.label + '（' + r.path + '）'
        : '撤销未执行：' + r.reason + (top ? '（下一候补：' + top.label + '）' : '（栈已空）')) + '</div>';
      if (r.ok) { WA.log('info', '已撤销编辑：' + r.label); renderBody(); }
    });
    on('#wa-mirror-view', () => {
      const out = $('#wa-diag-out');
      try {
        const m = WA.store.mirrorStat();
        let html = '<div class="wa-item"><b>镜像回落台账</b>：命中 ' + m.hits + ' / 未命中 ' + m.misses
          + ' / 读失败 ' + m.errors
          + '　最近：' + (m.last ? esc(JSON.stringify(m.last)) : '无')
          + '　分支父聊天：' + (m.branchParent || '（非分支）') + '</div>';
        html += '<button class="wa-btn" id="wa-mirror-rescue">从镜像恢复本聊天</button>';
        if (out) out.innerHTML = html;
        const rb = $('#wa-mirror-rescue');
        if (rb) rb.onclick = () => {
          const res = WA.store.rescueFromMirror();
          out.innerHTML = '<div class="wa-log ' + (res.ok ? 'wa-log-info' : 'wa-log-warn') + '">'
            + (res.ok ? '✓ 已从镜像恢复（' + res.bytes + 'B）' : '未恢复：' + esc(res.reason)) + '</div>';
          if (res.ok) renderBody();
        };
      } catch (e) { if (out) out.textContent = '镜像视图失败：' + (e && e.message); }
    });
    on('#wa-set-clock', () => { const v = askText('设定世界时间（如「三日目·黄昏」）：', WA.store.read('clock.label', '')); if (v != null) { WA.calendar.setClock(v); renderBody(); } });
    on('#wa-next-day', () => {
      if (!WA.calendar || typeof WA.calendar.advanceDay !== 'function') { WA.log('warn', '世界钟模块未加载'); return; }
      const day = WA.calendar.advanceDay({ source: 'user' });
      WA.log('info', day < 0 ? '世界钟缺失，未推进' : ('世界钟已推进至第' + day + '日'));
      renderBody();
    });
    on('#wa-cal-auto', () => {});
    { const cb = $('#wa-cal-auto');
      if (cb) cb.onchange = () => { WA.calendar.setSettings({ auto: cb.checked }); WA.log('info', '世界钟自动推进已' + (cb.checked ? '开启' : '关闭')); renderBody(); }; }
    (function () {
      // v2.35.0: 世界书选择/覆写/触发/刷新/预览
      const saveWb = function () {
        if (!WA.worldbook || typeof WA.worldbook.saveSelection !== 'function') return;
        const ids = [];
        const ov = {};
        panelEl.querySelectorAll('[data-wb-sel]').forEach(function (cb) { if (cb.checked) ids.push(cb.dataset.wbSel); });
        panelEl.querySelectorAll('[data-wb-ov]').forEach(function (sel) {
          const v = sel.value; if (v && v !== 'auto') ov[sel.dataset.wbOv] = v;
        });
        WA.worldbook.saveSelection(ids, ov);
      };
      panelEl.querySelectorAll('[data-wb-sel]').forEach(function (cb) { cb.onchange = function () { saveWb(); renderBody(); }; });
      panelEl.querySelectorAll('[data-wb-ov]').forEach(function (sel) { sel.onchange = function () { saveWb(); renderBody(); }; });
      const trig = $('#wa-wb-trigger');
      if (trig) trig.onchange = function () {
        if (WA.backstage && typeof WA.backstage.setSettings === 'function') WA.backstage.setSettings({ worldbookTrigger: !!trig.checked });
        renderBody();
      };
      on('#wa-wb-refresh', async function () {
        setOut('#wa-wb-out', '载入中…');
        try {
          if (!WA.worldbook || typeof WA.worldbook.loadCurrentEntries !== 'function') { setOut('#wa-wb-out', '世界书模块未加载'); return; }
          const list = await WA.worldbook.loadCurrentEntries();
          setOut('#wa-wb-out', '已载入 ' + ((list && list.length) || 0) + ' 条');
          renderBody();
        } catch (e) { setOut('#wa-wb-out', '载入失败：' + ((e && e.message) || e)); }
      });
      on('#wa-wb-preview', function () {
        __wbScan = ((($('#wa-wb-scan') || {}).value) || '');
        if (!WA.worldbook || typeof WA.worldbook.previewActivation !== 'function') { setOut('#wa-wb-out', '世界书模块未加载'); return; }
        const rows = WA.worldbook.previewActivation(__wbScan);
        const n = rows.filter(function (r) { return r.active; }).length;
        renderBody();
        setOut('#wa-wb-out', '预览：注入 ' + n + '/' + rows.length + (__wbScan ? '（扫描 ' + __wbScan.length + ' 字）' : '（无扫描文本）'));
      });
    })();
    on('#wa-ent-add', function () {
      const type = ((($('#wa-ent-type') || {}).value) || 'organization');
      const name = (((($('#wa-ent-name') || {}).value) || '')).trim();
      const desc = (((($('#wa-ent-desc') || {}).value) || '')).trim();
      if (!name) { setOut('#wa-ent-out', '请先填名称'); return; }
      if (!WA.entities || typeof WA.entities.upsert !== 'function') { setOut('#wa-ent-out', '实体库模块未加载'); return; }
      const r = WA.store.transact(function (d) { return WA.entities.upsert(d, type, { name: name, desc: desc }); });
      const act = r && r.result;
      setOut('#wa-ent-out', act === 'created' ? ('已新建「' + name + '」') : act === 'updated' ? ('已更新「' + name + '」') : ('未写入：' + act));
      if (act === 'created' || act === 'updated') renderBody();
    });
    on('#wa-npc-add', () => { const v = $('#wa-npc-name').value.trim(); if (v) { WA.registry.register(v); renderBody(); } });
    // v2.54.0：只操作已有势力或人物；余额不足时拒绝转移。
    // v2.55.0：长线伏笔只报欠账，不自动回收。
    const llVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const llOut = function (r, keep) {
      const text = r && r.ok ? ('已记录 ' + (r.id || r.reason || 'ok')) : ('未记录：' + ((r && r.reason) || '未知原因'));
      if (keep) panelEl.dataset.llOut = text;
      const o = $('#wa-ll-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.llOut) { const saved = $('#wa-ll-out'); if (saved) saved.textContent = panelEl.dataset.llOut; }
    { const el = $('#wa-ll-enabled');
      if (el) el.onchange = function () {
        if (!WA.longline) return llOut({ ok: false, reason: 'module-missing' }, true);
        WA.longline.setSettings({ enabled: !!el.checked });
        llOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' }, true);
      }; }
    on('#wa-ll-promise', () => { if (!WA.longline) return llOut({ ok: false, reason: 'module-missing' }, true); const mins = Number(llVal('#wa-ll-due')); const due = clockNow('ui.longline') + (isFinite(mins) && mins > 0 ? mins * 60000 : 0); llOut(WA.longline.promise(llVal('#wa-ll-id'), due), true); renderBody(); });
    on('#wa-ll-sweep', () => { if (!WA.longline) return llOut({ ok: false, reason: 'module-missing' }, true); const rows = WA.longline.overdue(); const r = WA.longline.sweep(); const pr = WA.longline.pressure(); const block = WA.longline.buildBlock(); llOut({ ok: true, id: rows.length + ':' + r.count + ':' + pr.level + ':' + (block ? 'block' : 'empty'), reason: '' }, true); });
    const orgVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const orgOut = function (r, keep) {
      const text = r && r.ok ? ('已记录 ' + (r.id || r.reason || 'ok')) : ('未记录：' + ((r && r.reason) || '未知原因'));
      if (keep) panelEl.dataset.orgOut = text;
      const o = $('#wa-org-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.orgOut) { const saved = $('#wa-org-out'); if (saved) saved.textContent = panelEl.dataset.orgOut; }
    { const el = $('#wa-org-enabled');
      if (el) el.onchange = function () {
        if (!WA.org) return orgOut({ ok: false, reason: 'module-missing' }, true);
        WA.org.setSettings({ enabled: !!el.checked });
        orgOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' }, true);
      }; }
    on('#wa-org-grant', () => { if (!WA.org) return orgOut({ ok: false, reason: 'module-missing' }, true); const r = WA.org.grant(orgVal('#wa-org-kind'), orgVal('#wa-org-name'), orgVal('#wa-org-item'), orgVal('#wa-org-qty')); const stock = r.ok ? WA.org.stockOf((WA.store.get()||{}).evolution && (WA.store.get().evolution.factions||[]).filter(function(f){return f.name===orgVal('#wa-org-name');})[0] || (((WA.store.get()||{}).people||{})['p_'+orgVal('#wa-org-name')])) : null; orgOut(Object.assign({}, r, { id: r.ok ? (r.id + ':' + r.amount + ':' + ((stock && stock[r.id]) || 0)) : r.id }), true); renderBody(); });
    on('#wa-org-transfer', () => { if (!WA.org) return orgOut({ ok: false, reason: 'module-missing' }, true); const item = orgVal('#wa-org-item'); const affordable = WA.org.canAfford(orgVal('#wa-org-kind'), orgVal('#wa-org-name'), item, orgVal('#wa-org-qty')); const r = WA.org.transfer(orgVal('#wa-org-kind'), orgVal('#wa-org-name'), orgVal('#wa-org-to-kind'), orgVal('#wa-org-to-name'), item, orgVal('#wa-org-qty')); orgOut(Object.assign({}, r, { id: r.ok ? (item + ':' + r.amount + ':' + (affordable ? 'affordable' : 'blocked')) : r.id }), true); renderBody(); });
    on('#wa-org-check', () => { if (!WA.org) return orgOut({ ok: false, reason: 'module-missing' }, true); const ok = WA.org.canAfford(orgVal('#wa-org-kind'), orgVal('#wa-org-name'), orgVal('#wa-org-item'), orgVal('#wa-org-qty')); const st = WA.org.stat(); orgOut({ ok: ok, id: (ok ? 'affordable' : 'insufficient') + ':' + st.blocked, reason: ok ? '' : 'insufficient' }, true); });
    const intelVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const intelOut = function (r, keep) {
      const text = r && r.ok ? ('已记录 ' + (r.id || r.status || 'ok')) : ('未记录：' + ((r && r.reason) || '未知原因'));
      if (keep) panelEl.dataset.intelOut = text;
      const o = $('#wa-intel-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.intelOut) { const saved = $('#wa-intel-out'); if (saved) saved.textContent = panelEl.dataset.intelOut; }
    { const el = $('#wa-intel-enabled');
      if (el) el.onchange = function () {
        if (!WA.intel) return intelOut({ ok: false, reason: 'module-missing' }, true);
        WA.intel.setSettings({ enabled: !!el.checked });
        intelOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' }, true);
      }; }
    on('#wa-intel-link', () => { if (!WA.intel) return intelOut({ ok: false, reason: 'module-missing' }, true); const effect = intelVal('#wa-intel-effect'); const known = WA.intel.knownCause(intelVal('#wa-intel-cause')); const r = WA.intel.addLink({ cause: intelVal('#wa-intel-cause'), effect: effect }); const ex = r.ok ? WA.intel.explain(effect) : null; intelOut(Object.assign({}, r, { id: r.ok ? (effect + ':' + (known ? 'known' : 'unknown') + ':' + ((ex && ex.causes || []).length)) : r.id }), true); renderBody(); });
    on('#wa-intel-add', () => { if (!WA.intel) return intelOut({ ok: false, reason: 'module-missing' }, true); const person = intelVal('#wa-intel-person'); const r = WA.intel.addIntel(person, { claim: intelVal('#wa-intel-claim'), source: intelVal('#wa-intel-source'), level: 'report', about: intelVal('#wa-intel-effect') }); const seen = r.ok ? WA.intel.visibleTo(person, intelVal('#wa-intel-effect')) : []; intelOut(Object.assign({}, r, { id: r.ok ? (r.status + ':' + seen.length + ':' + ((seen[0] && WA.intel.CONFIDENCE[seen[0].level]) || '')) : r.id }), true); renderBody(); });
    // v2.52.0：人物生活只写用户明确提交的内容；关闭开关后停止结算与注入。
    const lifeText = function () {
      const person = ($('#wa-life-person') || {}).value || '';
      const text = ($('#wa-life-text') || {}).value || '';
      return { person: person.trim(), text: text.trim() };
    };
    const lifeOut = function (r, keep) {
      const text = r && r.ok ? ('已记录 ' + (r.id || r.reason || 'ok')) : ('未记录：' + ((r && r.reason) || '未知原因'));
      if (keep) panelEl.dataset.lifeOut = text;
      const o = $('#wa-life-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.lifeOut) { const saved = $('#wa-life-out'); if (saved) saved.textContent = panelEl.dataset.lifeOut; }
    { const el = $('#wa-life-enabled');
      if (el) el.onchange = function () {
        if (!WA.life) { lifeOut({ ok: false, reason: 'module-missing' }, true); return; }
        WA.life.setSettings({ enabled: !!el.checked });
        lifeOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' }, true);
      }; }
    on('#wa-life-goal', () => { if (!WA.life) return lifeOut({ ok: false, reason: 'module-missing' }, true); const x = lifeText(); lifeOut(WA.life.addGoal(x.person, { text: x.text }), true); renderBody(); });
    on('#wa-life-promise', () => { if (!WA.life) return lifeOut({ ok: false, reason: 'module-missing' }, true); const x = lifeText(); lifeOut(WA.life.addCommitment(x.person, { kind: 'promise', target: '玩家', text: x.text }), true); renderBody(); });
    on('#wa-life-schedule', () => { if (!WA.life) return lifeOut({ ok: false, reason: 'module-missing' }, true); const x = lifeText(); const now = clockNow('ui.life'); lifeOut(WA.life.addSchedule(x.person, { activity: x.text, start: now, end: now + 3600000 }), true); renderBody(); });
    on('#wa-life-tick', () => { if (!WA.life) return lifeOut({ ok: false, reason: 'module-missing' }, true); const x = lifeText(); const now = clockNow('ui.life'); const person = WA.store && x.person ? ((WA.store.get()||{}).people||{})['p_'+x.person] : null; const goal = person && person.life && (person.life.goals||[]).filter(g=>g.status==='active')[0]; const decision = person && goal && WA.life.decide ? WA.life.decide(goal, person, { now: now, with: '玩家' }) : null; const r = WA.life.tick({ now: now, with: '玩家', decision: decision }); const why = decision ? (decision.action + '/' + decision.reason) : (r.reason || ''); lifeOut({ ok: !!r.ok, id: (r.changed || 0) + ':' + why, reason: r.reason }, true); renderBody(); });
    // v2.62.0：因果结算——原因必须已存在（knownCause 单一真源），延迟后果到点**只报告**，
    //   由用户显式结算；「取消」与「前提消失的失效」分开归因（两者都不得静默删记录）。
    const causalVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const causalOut = function (r, keep) {
      const text = r && r.ok ? ('已记录 ' + (r.id || r.reason || r.status || 'ok')) : ('未记录：' + ((r && r.reason) || '未知原因'));
      if (keep) panelEl.dataset.causalOut = text;
      const o = $('#wa-causal-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.causalOut) { const saved = $('#wa-causal-out'); if (saved) saved.textContent = panelEl.dataset.causalOut; }
    { const el = $('#wa-causal-enabled');
      if (el) el.onchange = function () {
        if (!WA.causal) { causalOut({ ok: false, reason: 'module-missing' }, true); return; }
        WA.causal.setSettings({ enabled: !!el.checked });
        causalOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' }, true);
      }; }
    on('#wa-causal-add', () => {
      if (!WA.causal) return causalOut({ ok: false, reason: 'module-missing' }, true);
      const cause = causalVal('#wa-causal-cause');
      const known = WA.causal.knownCause(cause);
      const dlTxt = causalVal('#wa-causal-delayed');
      const dlMins = Number(causalVal('#wa-causal-delayed-min'));
      const r = WA.causal.addChain({ cause: cause, condition: causalVal('#wa-causal-condition'), action: causalVal('#wa-causal-action'),
        immediate: causalVal('#wa-causal-immediate'),
        delayed: dlTxt ? [{ text: dlTxt, after: (isFinite(dlMins) && dlMins > 0 ? dlMins * 60000 : 0) }] : [] });
      causalOut(Object.assign({}, r, { id: r.ok ? (r.id + ':cause-' + (known ? 'known' : 'unknown') + ':d' + (r.delayed || 0)) : ('cause-' + (known ? 'known' : 'unknown') + ':' + r.reason) }), true);
      renderBody();
    });
    on('#wa-causal-tick', () => {
      if (!WA.causal) return causalOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.causal.tick({ now: clockNow('ui.causal') });
      const st = WA.causal.stat();
      causalOut({ ok: !!r.ok, id: (r.changed || 0) + ':exp-' + (r.expired || 0) + ':blk-' + st.blocked, reason: r.reason }, true);
      renderBody();
    });
    on('#wa-causal-due', () => {
      if (!WA.causal) return causalOut({ ok: false, reason: 'module-missing' }, true);
      const rows = WA.causal.due();
      // 到期 ≠ 已发生：这里只报「哪些延迟后果到点了」，结算必须显式再做一次。
      causalOut({ ok: true, id: 'due-' + rows.length + ':' + (rows[0] ? rows[0].chain : 'none') }, true);
    });
    on('#wa-causal-classify', () => {
      if (!WA.causal) return causalOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.causal.classify(causalVal('#wa-causal-id'));
      causalOut(Object.assign({}, r, { id: r.ok ? (r.status + ':happened-' + (r.happened ? 'y' : 'n') + ':pending-' + r.pending) : r.reason }), true);
    });
    on('#wa-causal-defer', () => {
      if (!WA.causal) return causalOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.causal.defer(causalVal('#wa-causal-id'), Number(causalVal('#wa-causal-by')));
      causalOut(Object.assign({}, r, { id: r.ok ? ('shifted-' + r.shifted) : r.reason }), true);
      renderBody();
    });
    on('#wa-causal-cancel', () => {
      if (!WA.causal) return causalOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.causal.cancel(causalVal('#wa-causal-id'), '面板取消');
      causalOut(Object.assign({}, r, { id: r.ok ? r.status : r.reason }), true);
      renderBody();
    });
    on('#wa-causal-settle', () => {
      if (!WA.causal) return causalOut({ ok: false, reason: 'module-missing' }, true);
      const rows = WA.causal.due();
      if (!rows.length) return causalOut({ ok: true, id: 'due-0' }, true);
      const r = WA.causal.settle(rows[0].chain, rows[0].id, '');
      const st = WA.causal.stat();
      causalOut(Object.assign({}, r, { id: r.ok ? (r.id + ':chain-' + r.chainStatus + ':left-' + Math.max(0, rows.length - 1) + ':blk-' + st.blocked) : r.reason }), true);
      renderBody();
    });
    // v2.62.0：稳定人物 ID 面板面（路线图前置收口① 的可见出口）。
    //   过去人物的「身份」只是 A-L 活动槽（模块内存态，刷新即丢、只容 12 人）。
    //   现在三层分开显示：**id**（持久编号）/ **存档键**（长期状态落点）/ **活动槽**（本轮计算）。
    //   把三者摆在一起，看的人才能一眼分辨「槽耗尽」不是「人物丢了」。
    const idVal = function () { return ((($('#wa-id-name') || {}).value) || '').trim(); };
    const idOut = function (r, keep) {
      const text = r && r.id ? ('已记录 ' + r.id) : ('未记录：' + ((r && r.reason) || '未知原因'));
      if (keep) panelEl.dataset.idOut = text;
      const o = $('#wa-id-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.idOut) { const saved = $('#wa-id-out'); if (saved) saved.textContent = panelEl.dataset.idOut; }
    on('#wa-id-lookup', () => {
      if (!WA.registry || typeof WA.registry.identityOf !== 'function') return idOut({ reason: 'registry-missing' }, true);
      const nm = idVal();
      if (!nm) return idOut({ reason: 'missing-name' }, true);
      const idn = WA.registry.identityOf(nm);          // 消费 identityOf（三位一体唯一入口）
      const slotOfName = (WA.registry.slotStat ? (WA.registry.slotStat().owners.filter(function (o) { return o.name === nm; })[0] || {}).slot : '') || '-';
      idOut({ id: idn.personId + ':' + idn.worldKey + ':slot-' + slotOfName }, true);
      renderBody();
    });
    on('#wa-id-bindall', () => {
      if (!WA.registry || typeof WA.registry.identityOf !== 'function') return idOut({ reason: 'registry-missing' }, true);
      // 为什么必须走注册表而不是 people 容器：注册表是「系统认为在场的人物」的既有真源，
      //   而 people 容器里的键是**状态落点**。补号的目的是让两者对上，不是新造人物。
      const names = WA.registry.list() || [];
      let n = 0, skip = 0;
      names.forEach(function (nm) {
        const before = WA.registry.idStat ? (WA.registry.idStat().ids[nm] || '') : '';
        if (before) { skip++; return; }
        if (WA.registry.identityOf(nm)) n++;
      });
      const st = WA.registry.idStat ? WA.registry.idStat() : {};
      idOut({ id: 'bound-' + n + ':skip-' + skip + ':total-' + st.bound + ':drift-' + ((st.stateWithoutId || []).length) }, true);
      renderBody();
    });
    on('#wa-id-clear', () => {
      if (!WA.registry || typeof WA.registry.idClear !== 'function') return idOut({ reason: 'registry-missing' }, true);
      const r = WA.registry.idClear(idVal());
      idOut(r.ok ? { id: r.name + ':' + r.id + ':unbound' } : { reason: r.reason }, true);
      renderBody();
    });
    // v2.63.0：世界织体 / 社交漩涡 / 悬案三面的面板绑定。
    //   三面各自的关键**拒绝理由**都必须看得见——它们在世界状态里都长得像「什么都没发生」：
    //     · world   —— unknown-place（地点没登记，不猜）/ unreachable（路没登记，不抄近路）
    //                  / scheduled-elsewhere（此时人在别处，不重叠）；
    //     · shadow  —— no-shadow / shadow-closed（没有可加深的秘密，不凭空升级）；
    //     · threads —— no-basis（不得凭空结案）/ conflicts-unresolved（矛盾不得被平均）。
    const wv = function (id) { return ((($(id) || {}).value) || '').trim(); };
    // v2.63.0: 面板出口用到的两个只读小工具。
    //   两者都只**读**当前状态、取不到就返回空，由引擎按「缺字段/缺依据」如实归因——
    //   面板不得为了让按钮「看起来能按」而替用户补一个默认值。
    const lastEventId = function () {
      try {
        const d = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
        const ev = (d.world && Array.isArray(d.world.events)) ? d.world.events : [];
        const tail = ev[ev.length - 1];
        return (tail && tail.id) ? tail.id : '';
      } catch (e) { return ''; }
    };
    const basisOf = function (threadId) {
      try {
        const d = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
        const arr = Array.isArray(d.threads) ? d.threads : [];
        const id = String(threadId == null ? '' : threadId).trim();
        const t = arr.filter(function (x) { return x && x.id === id; })[0];
        const leads = (t && Array.isArray(t.leads)) ? t.leads : [];
        return leads.map(function (l) { return l && l.id; }).filter(Boolean);
      } catch (e) { return []; }
    };
    const plainOut = function (outId, dataKey, r) {
      const bits = [];
      if (r && r.ok) {
        if (r.id) bits.push(r.id);
        if (r.status) bits.push(r.status);
        if (r.pair) bits.push(r.pair);
        if (r.minutes != null) bits.push(r.minutes + '分钟');
        if (r.hops != null) bits.push(r.hops + '跳');
        if (r.who) bits.push('到场 ' + (r.who.length ? r.who.join('、') : '无'));
        if (r.reachable === false) bits.push('走不通');
        if (r.conflicted === true) bits.push('有矛盾未解');
        if (r.conflicts && r.conflicts.length) bits.push('矛盾 ' + r.conflicts.length);
        if (r.basis) bits.push('依据 ' + r.basis + ' 条');
      }
      const text = (r && r.ok) ? ('已记录 ' + (bits.join(':') || 'ok')) : ('未记录：' + ((r && r.reason) || '未知原因'));
      if (dataKey) panelEl.dataset[dataKey] = text;
      const o = $('#' + outId); if (o) o.textContent = text;
    };
    const worldOut = function (r) { return plainOut('wa-world-out', 'worldOut', r); };
    const shadowOut = function (r) { return plainOut('wa-shadow-out', 'shadowOut', r); };
    const threadsOut = function (r) { return plainOut('wa-threads-out', 'threadsOut', r); };
    if (panelEl.dataset.worldOut) { const o = $('#wa-world-out'); if (o) o.textContent = panelEl.dataset.worldOut; }
    if (panelEl.dataset.shadowOut) { const o = $('#wa-shadow-out'); if (o) o.textContent = panelEl.dataset.shadowOut; }
    if (panelEl.dataset.threadsOut) { const o = $('#wa-threads-out'); if (o) o.textContent = panelEl.dataset.threadsOut; }
    { const el = $('#wa-world-enabled');
      if (el) el.onchange = function () {
        if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
        WA.world.setSettings({ enabled: !!el.checked });
        worldOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    on('#wa-world-addplace', () => {
      if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
      const r = WA.world.addPlace({ name: wv('#wa-world-place') });
      worldOut(Object.assign({}, r, { id: r.ok ? (r.name + (r.existed ? ':已有' : ':新登记')) : r.reason }));
      renderBody();
    });
    on('#wa-world-addroad', () => {
      if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
      const r = WA.world.addRoad(wv('#wa-world-rd-a'), wv('#wa-world-rd-b'), Number(wv('#wa-world-rd-min')));
      worldOut(Object.assign({}, r, { id: r.ok ? (r.minutes + '分钟') : r.reason }));
      renderBody();
    });
    on('#wa-world-reach', () => {
      if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
      // 没有登记的路 ⇒ 走不过去。这里如实报「不达」，**不**按直线距离兜底。
      const r = WA.world.reach(wv('#wa-world-rd-a'), wv('#wa-world-rd-b'));
      worldOut(r.ok ? Object.assign({}, r, { id: r.reachable ? (r.path.join('→') + ':' + r.minutes + '分钟') : '不达（未登记道路）' }) : r);
    });
    on('#wa-world-addevent', () => {
      if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
      const now = clockNow('ui.world');
      const r = WA.world.addEvent({ title: wv('#wa-world-ev-title'), place: wv('#wa-world-ev-place'), start: now, end: now + 3600000 });
      worldOut(Object.assign({}, r, { id: r.ok ? (r.kind + ':' + r.id) : r.reason }));
      renderBody();
    });
    on('#wa-world-tick', () => {
      if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
      const r = WA.world.tick({ now: clockNow('ui.world') });
      worldOut({ ok: !!r.ok, id: '变更 ' + (r.changed || 0) + ':' + r.reason });
      renderBody();
    });
    on('#wa-world-who', () => {
      if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
      // 到场者只认日程证据——没有依据的人**一个都不会**出现在名单里。
      const evId = wv('#wa-world-ev-title') || lastEventId();
      const r = WA.world.attendees(evId);
      if (!r.ok) return worldOut(r);
      // 「同期还有几场」——同一时段彼此争人的其它日程也要摆出来：
      //   只报「这场谁到了」，用户会以为这些人整个下午都闲着。
      const ev = ((WA.store.get().world || {}).events || []).filter(function (x) { return x && x.id === evId; })[0] || null;
      const same = ev ? WA.world.eventsBetween(ev.start, ev.end).filter(function (x) { return x && x.id !== evId; }).length : 0;
      worldOut(Object.assign({}, r, { id: '到场者（' + r.evidence + '）同期还有 ' + same + ' 场' }));
    });
    on('#wa-world-move', () => {
      if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
      const r = WA.world.move(wv('#wa-world-mv-who'), wv('#wa-world-mv-from'), wv('#wa-world-mv-to'), clockNow('ui.world'));
      worldOut(r.ok ? Object.assign({}, r, { id: r.path.join('→') }) : r);
    });
    on('#wa-world-canbe', () => {
      if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
      const r = WA.world.canBeAt(wv('#wa-world-mv-who'), wv('#wa-world-mv-to'), clockNow('ui.world'));
      worldOut(r.ok ? Object.assign({}, r, { id: '在场许可' }) : r);
    });
    { const el = $('#wa-shadow-enabled');
      if (el) el.onchange = function () {
        if (!WA.shadow) return shadowOut({ ok: false, reason: 'module-missing' });
        WA.shadow.setSettings({ enabled: !!el.checked });
        shadowOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    on('#wa-shadow-add', () => {
      if (!WA.shadow) return shadowOut({ ok: false, reason: 'module-missing' });
      const r = WA.shadow.addShadow(wv('#wa-shadow-a'), wv('#wa-shadow-b'), { secret: wv('#wa-shadow-secret') });
      shadowOut(Object.assign({}, r, { id: r.ok ? (r.pair + (r.existed ? ':已有' : (r.reopened ? ':重开' : ':新记'))) : r.reason }));
      renderBody();
    });
    on('#wa-shadow-deepen', () => {
      if (!WA.shadow) return shadowOut({ ok: false, reason: 'module-missing' });
      // 没有可加深的秘密时**明确归因**——不得把「刚认识」直接写成「生死之交」。
      const r = WA.shadow.deepen(wv('#wa-shadow-a'), wv('#wa-shadow-b'), 1);
      shadowOut(r.ok ? Object.assign({}, r, { id: r.before + '→' + r.after }) : r);
    });
    on('#wa-shadow-brighten', () => {
      if (!WA.shadow) return shadowOut({ ok: false, reason: 'module-missing' });
      const r = WA.shadow.brighten(wv('#wa-shadow-a'), wv('#wa-shadow-b'), 1);
      shadowOut(r.ok ? Object.assign({}, r, { id: r.before + '→' + r.after + ':' + r.status }) : r);
      renderBody();
    });
    on('#wa-shadow-lookup', () => {
      if (!WA.shadow) return shadowOut({ ok: false, reason: 'module-missing' });
      const r = WA.shadow.getShadow(wv('#wa-shadow-a'), wv('#wa-shadow-b'));
      shadowOut(r.ok ? Object.assign({}, r, { id: (r.exists ? (r.status + ':胁迫' + r.severity) : '无共同隐瞒') + ':经历' + r.exp.length }) : r);
    });
    on('#wa-shadow-visible', () => {
      if (!WA.shadow) return shadowOut({ ok: false, reason: 'module-missing' });
      // 此人**持有**的秘密（而不是「关于此人的秘密」）——这两件事在其它任何查询里都会混。
      //   同时列出与该人相关的经历条数：秘密是两人共有的，经历也是。
      const who = wv('#wa-shadow-a');
      const held = WA.shadow.visibleTo(who);
      const exp = WA.shadow.experiencesOf(who, wv('#wa-shadow-b'));
      shadowOut({ ok: true, id: '持有 ' + held.length + ' 桩（' + held.map(function (x) { return x.other; }).join('、') + '）:经历 ' + exp.length });
    });
    on('#wa-shadow-exp-kept', () => {
      if (!WA.shadow) return shadowOut({ ok: false, reason: 'module-missing' });
      shadowOut(WA.shadow.addExperience(wv('#wa-shadow-a'), wv('#wa-shadow-b'), { what: wv('#wa-shadow-what'), outcome: 'kept' }));
      renderBody();
    });
    on('#wa-shadow-exp-broken', () => {
      if (!WA.shadow) return shadowOut({ ok: false, reason: 'module-missing' });
      shadowOut(WA.shadow.addExperience(wv('#wa-shadow-a'), wv('#wa-shadow-b'), { what: wv('#wa-shadow-what'), outcome: 'broken' }));
      renderBody();
    });
    { const el = $('#wa-threads-enabled');
      if (el) el.onchange = function () {
        if (!WA.threads) return threadsOut({ ok: false, reason: 'module-missing' });
        WA.threads.setSettings({ enabled: !!el.checked });
        threadsOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    on('#wa-threads-open', () => {
      if (!WA.threads) return threadsOut({ ok: false, reason: 'module-missing' });
      threadsOut(WA.threads.open({ question: wv('#wa-threads-q') }));
      renderBody();
    });
    on('#wa-threads-lead', () => {
      if (!WA.threads) return threadsOut({ ok: false, reason: 'module-missing' });
      const r = WA.threads.addLead(wv('#wa-threads-id'), { claim: wv('#wa-threads-claim'), source: wv('#wa-threads-src'), reliability: 'trace' });
      threadsOut(Object.assign({}, r, { id: r.ok ? ('权重 ' + r.weight + ':' + r.status) : r.reason }));
      renderBody();
    });
    on('#wa-threads-refute', () => {
      if (!WA.threads) return threadsOut({ ok: false, reason: 'module-missing' });
      const r = WA.threads.addLead(wv('#wa-threads-id'), { claim: wv('#wa-threads-claim'), source: wv('#wa-threads-src'), reliability: 'trace', polarity: 'refutes' });
      threadsOut(Object.assign({}, r, { id: r.ok ? ('反证 权重 ' + r.weight) : r.reason }));
      renderBody();
    });
    on('#wa-threads-converge', () => {
      if (!WA.threads) return threadsOut({ ok: false, reason: 'module-missing' });
      // 矛盾原样列出，**不取平均**——平均掉等于真线索与假线索同归于尽。
      const r = WA.threads.converge(wv('#wa-threads-id'));
      threadsOut(r.ok ? Object.assign({}, r, { id: '支撑' + r.supports + ':反证' + r.refutes + (r.conflicted ? ':矛盾未解' : '') }) : r);
    });
    on('#wa-threads-stall', () => {
      if (!WA.threads) return threadsOut({ ok: false, reason: 'module-missing' });
      // 悬置**不是**结案：记录不删，案子仍在查。
      threadsOut(WA.threads.stall(wv('#wa-threads-id'), '线索断了'));
      renderBody();
    });
    on('#wa-threads-resolve', () => {
      if (!WA.threads) return threadsOut({ ok: false, reason: 'module-missing' });
      // 结案依据 = 本案**已存在的全部线索 id**（面板只列事实，不替引擎编依据）。
      //   有矛盾未解时由 `resolve()` 自己拒收并归因 `conflicts-unresolved`——
      //   面板不预先「净化」矛盾，否则用户看不到他为什么结不了案。
      const basis = basisOf(wv('#wa-threads-id'));
      const r = WA.threads.resolve(wv('#wa-threads-id'), { answer: wv('#wa-threads-answer'), basis: basis });
      threadsOut(Object.assign({}, r, { id: r.ok ? ('依据 ' + r.basis + ' 条') : r.reason }));
      renderBody();
    });
    on('#wa-threads-abandon', () => {
      if (!WA.threads) return threadsOut({ ok: false, reason: 'module-missing' });
      threadsOut(WA.threads.abandon(wv('#wa-threads-id'), wv('#wa-threads-answer') || '不再追查'));
      renderBody();
    });
    on('#wa-threads-why', () => {
      if (!WA.threads) return threadsOut({ ok: false, reason: 'module-missing' });
      const r = WA.threads.explain(wv('#wa-threads-id'));
      threadsOut(r.ok ? Object.assign({}, r, { id: r.answer + ':依据 ' + r.basis.length + ' 条' }) : r);
    });
    on('#wa-de-create', async () => { const p = $('#wa-de-prompt').value.trim(); const t = +$('#wa-de-turns').value || 6; const btn = $('#wa-de-create'); if (btn) { btn.textContent = '生成中…'; btn.disabled = true; } try { await WA.directEvent.create({ prompt: p, turns: t }); } finally { renderBody(); } });
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
      panelEl.querySelectorAll('[data-ef-del]').forEach(b => b.onclick = () => {
          // v2.30.0（P0-2）：破坏性删除入撤销栈——before 必须在 transact 改内存前取好（显式值优先）
          const arr = WA.store.read('evolution.factions', []);
          const idx = +b.dataset.efDel;
          if (arr[idx]) WA.undo.pushValue('删除势力「' + (arr[idx].name || idx) + '」', 'evolution.factions', arr.slice());
          WA.store.transact(d => WA.editorFaction.remove(d, idx));
          if (typeof WA.editorFaction.setEditingId === 'function') WA.editorFaction.setEditingId(null);
          renderBody();
        });
      panelEl.querySelectorAll('[data-ef-copy]').forEach(b => b.onclick = () => { WA.store.transact(d => WA.editorFaction.copy(d, +b.dataset.efCopy)); renderBody(); });
      panelEl.querySelectorAll('[data-ef-edit]').forEach(b => b.onclick = () => {
        // v2.11.0: 编辑态唯一的写入口（此前 setEditingId 零调用 ⇒ 阅读态永远无标记可显示）
        if (typeof WA.editorFaction.setEditingId === 'function') WA.editorFaction.setEditingId(+b.dataset.efEdit);
        const arr = WA.editorFaction.list();
        const cur = arr[+b.dataset.efEdit];
        const next = askText('运势（' + WA.editorFaction.STATUSES.join('/') + '）：', cur && cur.status);
        if (next != null) {
          const rel = askText('关系（' + WA.editorFaction.RELATIONS.join('/') + '）：', cur && cur.relation);
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
          setOut('#wa-snap-out', r.ok
            ? ('恢复成功（恢复点' + (r.recoveryCreated ? '已留' : '未留') + '）：' + JSON.stringify(r.counts))
            : ('校验/写入失败：' + r.reason));
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
    on('#wa-gen-choices', async () => { setOut('#wa-choices-out', '生成中…'); const cs = await WA.choices.generate(4); setHtml('#wa-choices-out', cs.length ? cs.map((c, i) => `<div class="wa-item">${i + 1}. ${esc(c)}</div>`).join('') : '（未配置choices通道或生成失败）'); });
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
    // v2.50.0（第三十五面）：三账的两个只读出口。
    //   「出处置计划」把 floorChanges.plan() 的全部动作摊开（**不做**任何回收）；
    //   「立即采样」手动喂一次台账时间轴（面板打开时也可取一份，不必等下一轮注入）。
    //   两者都只读：本版刻意不提供任何自动回收按钮（回收不可逆）。
    const fcBtn = $('#wa-fc-plan');
    if (fcBtn) fcBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.floorChanges) return;
      try {
        const p = WA.floorChanges.plan();
        let html = '<div class="wa-log wa-log-' + ((p.actions || []).length ? 'warn' : 'info') + '">处置计划（本版**不自动执行**：executable=' + esc(String(p.executable)) + '）</div>';
        html += '<div class="wa-item">盘点 ' + esc(String((p.scanned || {}).sites | 0)) + ' 处引用面 · 缺失 '
          + esc(String((p.missing || []).length)) + ' 处 · 内容变更 ' + esc(String((p.changed || []).length)) + ' 处</div>';
        html += '<div class="wa-item">与结算守卫对账：<b>' + esc(String((p.guard || {}).verdict || '?')) + '</b>'
          + '<div class="wa-dim">' + esc(String((p.guard || {}).note || '')) + '</div></div>';
        html += (p.actions || []).map(function (a) {
          return '<div class="wa-item"><span class="wa-tag">' + esc(a.act) + '</span>'
            + (a.needConfirm ? '<span class="wa-dim">需确认</span>' : '')
            + '<div class="wa-dim">' + esc(a.detail) + '</div></div>';
        }).join('') || '<div class="wa-empty">无待处置项</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '处置计划读取失败：' + (e && e.message); }
    };
    const fcReset = $('#wa-fc-reset');
    if (fcReset) fcReset.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.floorChanges) return;
      try { WA.floorChanges.reset(); out.innerHTML = '<div class="wa-log wa-log-info">✓ 已清空楼层变更窗口（只清观测记录，世界状态与派生数据未动）</div>'; }
      catch (e) { out.textContent = '清空失败：' + (e && e.message); }
    };
    const ltBtn = $('#wa-lt-refresh');
    if (ltBtn) ltBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.ledgerTimeline) return;
      try {
        const n = WA.ledgerTimeline.probeDefault();
        const st = WA.ledgerTimeline.stat();
        let html = '<div class="wa-log wa-log-info">✓ 已采样 ' + esc(String(n)) + ' 个站点（读数成功数；首轮只见基线不判涨跌）</div>';
        html += '<div class="wa-item">' + esc(WA.ledgerTimeline.summaryText()) + '</div>';
        if ((st.failing || []).length) html += '<div class="wa-log wa-log-warn">本窗口内新增失败：' + esc((st.failing || []).join('、')) + '</div>';
        if ((st.stalled || []).length) html += '<div class="wa-dim">连续同态：' + esc((st.stalled || []).join('、')) + '（中性：可能是稳定也可能是停摆）</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '采样失败：' + (e && e.message); }
    };
    const ltReset = $('#wa-lt-reset');
    if (ltReset) ltReset.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.ledgerTimeline) return;
      try { WA.ledgerTimeline.reset(); out.innerHTML = '<div class="wa-log wa-log-info">✓ 已清空台账时间轴窗口（只清观测窗口，各引擎台账未动）</div>'; }
      catch (e) { out.textContent = '清空失败：' + (e && e.message); }
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
        if (WA.undo && WA.undo.clear) WA.undo.clear(); // v2.30.0: 撤销栈同属运行痕迹，一并清空
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
            quarantine: '隔离副本', legacy: '旧键迁移', stamp: '结构指纹',
            verify: '写后读回不一致' };
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
              .map(function (k) { return ({ guarded: '删完仍在', missing: '登记项缺 key', setItem: '删除被拒', quarantine: '隔离路径', legacy: '旧键迁移', settings: '设置键出口', verifyBack: '写后/删后复核读回' }[k] || k) + '×' + byR[k]; }).join('、');
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
              .map(function (k) { return ({ read: '存储层读取', parse: '值解析', migrate: '迁移', copy: '返回值拷贝',
              rmExisted: '受控删除的存在性探测', verifyBack: '写后/删后复核读回', legacyRead: 'legacy 旧键读取',
              saveInherit: '保存时继承结构指纹', subkeyAudit: '子键缺口盘点', pendingOrphan: '幽灵键盘点',
              verifyDefaults: '默认值声明校验', lsRaw: '幽灵设置盘点原文' }[k] || k) + '×' + byRd[k]; }).join('、');
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
            readSpotCheck: '诊断抽查列目录', chatcacheState: '聊天快照',
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
    if (askBtn) askBtn.onclick = async () => { const q = $('#wa-ask-input').value.trim(); if (!q) return; setOut('#wa-ask-out', '思考中…'); const r = await WA.assistant.ask(q); setOut('#wa-ask-out', r.ok ? r.text : ('失败：' + r.reason)); };
    let thLast = null;   // v2.2.0: 最近一次剧场产物（供「插入输入框」使用）
    const thBtn = $('#wa-theater-btn');
    if (thBtn) thBtn.onclick = async () => {
      setOut('#wa-theater-out', '剧场编排中…');
      const r = await WA.theater.generate($('#wa-theater-input').value.trim());
      thLast = r.ok ? r.text : null;
      setOut('#wa-theater-out', r.ok ? r.text : ('失败：' + (r.reason || (r.error && r.error.message))));
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
    // ── v2.33.0：记忆页 ──
    //   删除/停用均走 store.patch（受控写入 → 自动入撤销栈），失败不静默；
    //   任一修改后重绘本页，保证「界面上的 = 磁盘上的」。
    const memOut = function (msg, bad) { const o = $('#wa-mem-out'); if (o) o.innerHTML = '<div class="wa-log ' + (bad ? 'wa-log-warn' : 'wa-log-info') + '">' + esc(msg) + '</div>'; };
    on('#wa-mem-q-go', () => { __memQ = ($('#wa-mem-q') && $('#wa-mem-q').value) || ''; __memRefKey = null; renderBody(); });
    on('#wa-mem-fact-add', () => {
      const k = ($('#wa-mem-fact-k') && $('#wa-mem-fact-k').value || '').trim();
      const v = ($('#wa-mem-fact-v') && $('#wa-mem-fact-v').value || '').trim();
      if (!k) { memOut('请先填事实名', true); return; }
      const s = WA.store.get();
      const facts = (s.memory && s.memory.facts) || [];
      const i = facts.findIndex(f => f && f.key === k);
      if (i >= 0) { memOut('事实名「' + k + '」已存在（v' + (facts[i].version || 1) + '）——请改名，或点该条「停用」', true); return; }
      const next = facts.slice();
      next.push({ key: k, value: v, version: 1, active: true, reason: '面板手动新增', at: clockNow('ui.panel') });
      const r = WA.store.patch('memory.facts', next);
      memOut(r && r.ok ? ('已新增事实「' + k + '」') : ('写入失败：' + ((r && r.reason) || '?')), !(r && r.ok));
      if (r && r.ok) renderBody();
    });
    panelEl.querySelectorAll('[data-factdel]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.factdel); const s = WA.store.get();
      const cur = (s.memory && s.memory.facts) || []; if (!cur[i]) return;
      const label = String(cur[i].key || '');
      const next = cur.slice(); next.splice(i, 1);
      const r = WA.store.patch('memory.facts', next);
      memOut(r && r.ok ? ('已删除事实「' + label + '」（可经工具页「撤销编辑」回滚）') : ('删除失败：' + ((r && r.reason) || '?')), !(r && r.ok));
      if (r && r.ok) renderBody();
    });
    panelEl.querySelectorAll('[data-facttoggle]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.facttoggle); const s = WA.store.get();
      const cur = (s.memory && s.memory.facts) || []; if (!cur[i]) return;
      const next = cur.slice(); next[i] = Object.assign({}, next[i], { active: !(next[i].active !== false) });
      const r = WA.store.patch('memory.facts', next);
      memOut(r && r.ok ? (next[i].key + ' 已' + (next[i].active ? '启用' : '停用')) : ('写入失败：' + ((r && r.reason) || '?')), !(r && r.ok));
      if (r && r.ok) renderBody();
    });
    panelEl.querySelectorAll('[data-fsdel]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.fsdel); const s = WA.store.get();
      const cur = (s.memory && s.memory.foreshadows) || []; if (!cur[i]) return;
      const next = cur.slice(); next.splice(i, 1);
      const r = WA.store.patch('memory.foreshadows', next);
      memOut(r && r.ok ? '已删除伏笔（可经工具页「撤销编辑」回滚）' : ('删除失败：' + ((r && r.reason) || '?')), !(r && r.ok));
      if (r && r.ok) renderBody();
    });
    // v2.34.0: 伏笔状态流转（waiting→developing→triggered→recycled）
    panelEl.querySelectorAll('[data-fsst]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.fsst); const s = WA.store.get();
      const cur = (s.memory && s.memory.foreshadows) || []; if (!cur[i]) return;
      const CYCLE = ['waiting', 'developing', 'triggered', 'recycled'];
      const idx = CYCLE.indexOf(cur[i].status);
      const nxt = CYCLE[(idx + 1) % CYCLE.length];
      const next = cur.slice(); next[i] = Object.assign({}, next[i], { status: nxt });
      const r = WA.store.patch('memory.foreshadows', next);
      const LABELS = { waiting: '等待', developing: '发展中', triggered: '已触发', recycled: '已回收' };
      memOut(r && r.ok ? ('伏笔已推进至「' + (LABELS[nxt] || nxt) + '」（可经撤销回滚）') : ('写入失败：' + ((r && r.reason) || '?')), !(r && r.ok));
      if (r && r.ok) renderBody();
    });
    // v2.34.0: 伏笔放弃
    panelEl.querySelectorAll('[data-fsdrop]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.fsdrop); const s = WA.store.get();
      const cur = (s.memory && s.memory.foreshadows) || []; if (!cur[i]) return;
      const next = cur.slice(); next[i] = Object.assign({}, next[i], { status: 'dropped' });
      const r = WA.store.patch('memory.foreshadows', next);
      memOut(r && r.ok ? '伏笔已标记为「已放弃」' : ('写入失败：' + ((r && r.reason) || '?')), !(r && r.ok));
      if (r && r.ok) renderBody();
    });
    panelEl.querySelectorAll('[data-refview]').forEach(b => b.onclick = () => {
      const k = b.dataset.refview;
      __memRefKey = (__memRefKey === k) ? null : k;
      renderBody();
    });
    // ── v2.33.0：注入页 ──
    on('#wa-inj-refresh', () => {
      const snap = (WA.injectInspector && WA.injectInspector.getLastSnapshot) ? WA.injectInspector.getLastSnapshot() : null;
      const o = $('#wa-inj-out');
      if (o) o.textContent = snap ? ('最新快照：' + WA.injectInspector.statusText(snap.status, snap.scope) + '（' + _msTs(snap.at) + '）') : '尚无快照——先推演一轮。';
    });
    // v2.45.0: 条目路由控件（读写引擎公共面，非别名引用）
    on('#wa-er-add', () => {
      const id = ($('#wa-er-id') || {}).value ? $('#wa-er-id').value.trim() : '';
      const cond = ($('#wa-er-cond') || {}).value ? $('#wa-er-cond').value.trim() : '';
      if (!id) { setOut('#wa-er-out', '请填写条目 id。'); return; }
      const ok = WA.entryRouter.setCandidate({ id: id, title: id, condition: cond });
      setOut('#wa-er-out', ok ? ('已加入候选：' + id + '（' + cond + '）') : '未加入：启用条件为空时条目不参与路由。');
      if (ok) renderBody();
    });
    on('#wa-er-clear', () => {
      WA.entryRouter.clearCandidates();
      WA.entryRouter.clearCache();
      setOut('#wa-er-out', '候选集与缓存已清空。');
      renderBody();
    });
    panelEl.querySelectorAll('[data-er-del]').forEach(b => b.onclick = () => {
      const ok = WA.entryRouter.removeCandidate(b.dataset.erDel);
      setOut('#wa-er-out', ok ? ('已移除候选：' + b.dataset.erDel) : '未移除：候选集里没有这个 id。');
      if (ok) renderBody();
    });
    on('#wa-er-dry', async () => {
      const el = $('#wa-er-input');
      const q = el && el.value ? el.value.trim() : '';
      setOut('#wa-er-out', '试跑中…');
      try {
        const p = await WA.entryRouter.plan(q);
        const hid = (p.hidden || []).join('、') || '（无）';
        setOut('#wa-er-out', (p.degraded ? '降级（不隐藏任何条目）：' : (p.fromCache ? '命中缓存：' : '判定完成：'))
          + '激活 ' + (p.enabled || []).length + ' 条｜隐藏 ' + hid);
      } catch (e) { setOut('#wa-er-out', '试跑失败：' + ((e && e.message) || e)); }
    });
    on('#wa-er-apply', () => {
      const p = WA.entryRouter.lastRoute();
      const all = WA.entryRouter.listCandidates();
      const on = (p && p.enabled) || [];
      const r = WA.entryRouter.applyPlan({ hidden: all.filter(c => on.indexOf(c.id) < 0).map(c => c.id), degraded: !p });
      setOut('#wa-er-out', r.applied ? ('已落覆写：隐藏 ' + r.hidden + ' 条') : ('未落覆写：' + (r.reason || '无可用轮次')));
      if (r.applied) renderBody();
    });
    on('#wa-inj-diag', () => {
      const toolTab = panelEl.querySelectorAll('.wa-tab').filter(t => t.dataset.page === 'tools')[0];
      if (toolTab) toolTab.click();
      const btn = $('#wa-diag-run'); if (btn) btn.click();
    });
    // ── v2.46.0：变量驱动条款（万花筒）──
    // 三态在界面上必须分开呈现（命中 / 缺路径 / 非法）：只报「0 条命中」会让用户
    // 把「路径写错」读成「条件没满足」，两者的处置方向相反。
    function _kaShow() {
      if (!WA.kaleidoscope || typeof WA.kaleidoscope.evaluate !== 'function') { setOut('#wa-ka-out', '万花筒引擎未加载。'); return; }
      const block = WA.kaleidoscope.buildBlock();
      const snap = WA.kaleidoscope.snapshot();
      const last = WA.kaleidoscope.lastEval();
      const parts = ['派生 ' + snap.derives + ' 成功 / ' + snap.missing + ' 缺路径 / ' + snap.invalid + ' 非法',
        '规则命中 ' + snap.hit + ' / 跳过 ' + snap.skipped];
      if (snap.unresolved.length) parts.push('未解析占位符（原样保留）：' + snap.unresolved.join('、'));
      parts.push('求值时间：' + _msTs(last ? last.at : snap.at));
      setOut('#wa-ka-out', parts.join('\n') + (block ? '\n\n本回合将注入：\n' + block : '\n\n本回合不注入（0 token）。'));
    }
    on('#wa-ka-add', () => {
      const id = ($('#wa-ka-id') || {}).value ? $('#wa-ka-id').value.trim() : '';
      const path = ($('#wa-ka-path') || {}).value ? $('#wa-ka-path').value.trim() : '';
      const op = ($('#wa-ka-op') || {}).value ? $('#wa-ka-op').value.trim() : 'map';
      if (!id) { setOut('#wa-ka-out', '请填写派生量 id。'); return; }
      const rec = { id: id, op: op };
      if (op === 'formula') rec.args = { expr: path }; else rec.path = path;
      const r = WA.kaleidoscope.setDerive(rec);
      if (!r.ok) { setOut('#wa-ka-out', '未写入：' + r.reason + ' — ' + (r.detail || '')); return; }
      // 先重绘再回话：重绘会换掉整段 body，回话写在重绘之前会被自己擦掉。
      renderBody();
      _kaShow();
    });
    on('#wa-ka-rule-add', () => {
      const id = ($('#wa-ka-rule-id') || {}).value ? $('#wa-ka-rule-id').value.trim() : '';
      const when = ($('#wa-ka-rule-when') || {}).value ? $('#wa-ka-rule-when').value.trim() : '';
      const text = ($('#wa-ka-rule-text') || {}).value ? $('#wa-ka-rule-text').value : '';
      if (!id) { setOut('#wa-ka-out', '请填写规则 id。'); return; }
      const r = WA.kaleidoscope.setRule({ id: id, when: when, text: text });
      if (!r.ok) { setOut('#wa-ka-out', '未写入：' + r.reason + ' — ' + (r.detail || '')); return; }
      renderBody();
      _kaShow();
    });
    on('#wa-ka-eval', () => { _kaShow(); });
    on('#wa-ka-clear', () => {
      WA.kaleidoscope.clearDerives();
      WA.kaleidoscope.clearRules();
      renderBody();
      setOut('#wa-ka-out', '派生量与规则已清空（世界状态未改动）。');
    });
    panelEl.querySelectorAll('[data-ka-del]').forEach(b => b.onclick = () => {
      const ok = WA.kaleidoscope.removeDerive(b.dataset.kaDel);
      if (ok) renderBody();
      setOut('#wa-ka-out', ok ? ('已删除派生量：' + b.dataset.kaDel) : '未删除：没有这个派生量。');
    });
    panelEl.querySelectorAll('[data-ka-rdel]').forEach(b => b.onclick = () => {
      const ok = WA.kaleidoscope.removeRule(b.dataset.kaRdel);
      if (ok) renderBody();
      setOut('#wa-ka-out', ok ? ('已删除规则：' + b.dataset.kaRdel) : '未删除：没有这条规则。');
    });
    // v2.34.0: 长期事实清空
    on('#wa-mem-facts-clear', () => {
      const s = WA.store.get();
      const cur = (s.memory && s.memory.facts) || [];
      if (!cur.length) return;
      const r = WA.store.patch('memory.facts', []);
      memOut(r && r.ok ? ('已清空 ' + cur.length + ' 条长期事实（可经撤销回滚）') : ('清空失败：' + ((r && r.reason) || '?')), !(r && r.ok));
      if (r && r.ok) renderBody();
    });
    // v2.34.0: 仇敌状态推进
    panelEl.querySelectorAll('[data-ensel]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.ensel); const s = WA.store.get();
      const arr = (s.evolution && s.evolution.enemies) || []; if (!arr[i]) return;
      const CYC = ['追踪中', '策划中', '执行中', '已终结'];
      const idx = CYC.indexOf(arr[i].status);
      const nxt = CYC[(idx + 1) % CYC.length];
      const next = arr.slice(); next[i] = Object.assign({}, next[i], { status: nxt });
      if (nxt === '已终结' && next[i].terminatedRound == null) next[i].terminatedRound = (s.evolution && s.evolution.round) || 0;
      const r = WA.store.patch('evolution.enemies', next);
      const o = $('#wa-en-out');
      if (o) o.textContent = r && r.ok ? ('仇敌「' + next[i].name + '」已推进至「' + nxt + '」（可经撤销回滚）') : ('写入失败：' + ((r && r.reason) || '?'));
      if (r && r.ok) renderBody();
    });
    // v2.34.0: 大势结束
    panelEl.querySelectorAll('[data-wtdel]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.wtdel); const s = WA.store.get();
      const arr = (s.evolution && s.evolution.worldTrends) || []; if (!arr[i]) return;
      const next = arr.slice(); next[i] = Object.assign({}, next[i], { status: '已结束' });
      const r = WA.store.patch('evolution.worldTrends', next);
      const o = $('#wa-en-out');
      if (o) o.textContent = r && r.ok ? ('大势「' + next[i].name + '」已结束') : ('写入失败：' + ((r && r.reason) || '?'));
      if (r && r.ok) renderBody();
    });
    // v2.34.0: 平行世界 —— 设置存 / 手动推进 / 提示词与注入块预览 / NPC录入删除 / 事件丢弃
    on('#wa-pw-save', () => {
      const o = $('#wa-pw-out');
      try {
        if (!WA.parallelWorld) { if (o) o.textContent = 'parallelWorld 模块未加载'; return; }
        const r = WA.parallelWorld.setSettings({
          enabled: !!(($('#wa-pw-enable') || {}).checked),
          autoMode: (($('#wa-pw-mode') || {}).value) || 'manual',
          autoInterval: Number((($('#wa-pw-int') || {}).value) || 5),
          diceEnabled: !!(($('#wa-pw-dice') || {}).checked),
          detailLevel: (($('#wa-pw-detail') || {}).value) || 'normal'
        });
        if (o) o.textContent = r && r.ok ? ('平行世界设置已保存（生效值：' + JSON.stringify(WA.parallelWorld.effectiveSettings()) + '）') : ('保存失败：' + ((r && r.reason) || '?'));
        if (r && r.ok) renderBody();
      } catch (e) { if (o) o.textContent = '保存失败：' + (e && e.message); }
    });
    on('#wa-pw-advance', () => {
      const o = $('#wa-pw-out');
      const btn = $('#wa-pw-advance');
      if (!WA.parallelWorld) { if (o) o.textContent = 'parallelWorld 模块未加载'; return; }
      if (btn) btn.disabled = true;
      if (o) o.textContent = '推进中…（调用 inference 通道）';
      WA.parallelWorld.advance('manual').then(res => {
        if (o) o.textContent = res && res.ok
          ? ('推进成功：新事件 ' + res.modules + ' 条 / NPC 更新 ' + res.npcs + ' 个（第 ' + (((WA.store.get().parallelWorld || {}).round) || 0) + ' 轮）')
          : ('推进失败：' + ((res && res.reason) || '?') + '（通道未配置时属预期——先连接页配 inference）');
        renderBody();
      }).catch(e => {
        if (o) o.textContent = '推进异常：' + (e && e.message);
        if (btn) btn.disabled = false;
      });
    });
    on('#wa-pw-prompt', () => {
      const o = $('#wa-pw-out');
      try {
        if (!WA.parallelWorld || typeof WA.parallelWorld.buildPrompt !== 'function') { if (o) o.textContent = 'parallelWorld 模块未加载'; return; }
        if (o) o.textContent = WA.parallelWorld.buildPrompt();
      } catch (e) { if (o) o.textContent = '预览失败：' + (e && e.message); }
    });
    on('#wa-pw-block', () => {
      const o = $('#wa-pw-out');
      try {
        if (!WA.parallelWorld || typeof WA.parallelWorld.buildParallelBlock !== 'function') { if (o) o.textContent = 'parallelWorld 模块未加载'; return; }
        const b = WA.parallelWorld.buildParallelBlock();
        if (o) o.textContent = b || '当前无 high/critical 平行事件——注入块为空（低影响事件只存档不进主线）';
      } catch (e) { if (o) o.textContent = '预览失败：' + (e && e.message); }
    });
    on('#wa-pw-snap-save', () => {
      const o = $('#wa-pw-out');
      if (!WA.parallelWorld || typeof WA.parallelWorld.saveSnapshot !== 'function') { if (o) o.textContent = 'parallelWorld 模块未加载'; return; }
      const label = (((($('#wa-pw-snap-label') || {}).value) || '')).trim();
      const r = WA.parallelWorld.saveSnapshot(label);
      if (o) o.textContent = r && r.ok ? ('快照已保存' + (label ? '「' + label + '」' : '')) : ('保存失败：' + ((r && r.reason) || '?'));
      if (r && r.ok) renderBody();
    });
    panelEl.querySelectorAll('[data-pwsnap-restore]').forEach(b => b.onclick = () => {
      const o = $('#wa-pw-out');
      if (!WA.parallelWorld) { if (o) o.textContent = 'parallelWorld 模块未加载'; return; }
      const r = WA.parallelWorld.restoreSnapshot(b.dataset.pwsnapRestore);
      if (o) o.textContent = r && r.ok ? '快照已恢复（设置不变）' : ('恢复失败：' + ((r && r.reason) || '?'));
      if (r && r.ok) renderBody();
    });
    panelEl.querySelectorAll('[data-pwsnap-drop]').forEach(b => b.onclick = () => {
      const o = $('#wa-pw-out');
      if (!WA.parallelWorld) { if (o) o.textContent = 'parallelWorld 模块未加载'; return; }
      const r = WA.parallelWorld.dropSnapshot(b.dataset.pwsnapDrop);
      if (o) o.textContent = r && r.ok ? '快照已删除' : ('删除失败：' + ((r && r.reason) || '?'));
      if (r && r.ok) renderBody();
    });
    on('#wa-pw-npc-add', () => {
      const o = $('#wa-pw-out');
      const name = ((($('#wa-pw-npc-name') || {}).value) || '').trim();
      if (!name) { if (o) o.textContent = '请先填 NPC 姓名'; return; }
      if (!WA.parallelWorld) { if (o) o.textContent = 'parallelWorld 模块未加载'; return; }
      const r = WA.parallelWorld.addNpc({ name: name, CURRENT_THOUGHT: ((($('#wa-pw-npc-goal') || {}).value) || '').slice(0, 120) });
      if (o) o.textContent = r && r.ok ? ('NPC「' + name + '」已录入平行世界（可撤销）') : ('录入失败：' + ((r && r.reason) || '?'));
      if (r && r.ok) renderBody();
    });
    panelEl.querySelectorAll('[data-pwnrm]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.pwnrm); const s = WA.store.get();
      const arr = (s.parallelWorld && s.parallelWorld.npcs) || []; if (!arr[i]) return;
      const name = arr[i].name;
      const r = WA.parallelWorld.removeNpc(name);
      const o = $('#wa-pw-out');
      if (o) o.textContent = r && r.ok ? ('NPC「' + name + '」档案已移除（连带关系边，可撤销）') : ('移除失败：' + ((r && r.reason) || '?'));
      if (r && r.ok) renderBody();
    });
    panelEl.querySelectorAll('[data-pwmod]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.pwmod); const s = WA.store.get();
      const arr = (s.parallelWorld && s.parallelWorld.modules) || []; if (!arr[i]) return;
      const r = WA.parallelWorld.dropModule(arr[i].id);
      const o = $('#wa-pw-out');
      if (o) o.textContent = r && r.ok ? ('平行事件「' + arr[i].title + '」已丢弃（可撤销）') : ('丢弃失败：' + ((r && r.reason) || '?'));
      if (r && r.ok) renderBody();
    });
    (function () {
      const sel = $('#wa-pw-mode'), inp = $('#wa-pw-int');
      if (sel && inp) sel.onchange = () => { inp.disabled = sel.value !== 'every_n'; renderBody(); };
    })();
    // v2.34.0: 记忆采样预览
    on('#wa-samp-preview', () => {
      const o = $('#wa-samp-out');
      try {
        if (!WA.memorySampler || typeof WA.memorySampler.buildBlock !== 'function') { setOut('#wa-samp-out', 'memorySampler 模块未加载'); return; }
        const s = WA.store.get();
        const recent = (WA.mainWin && WA.mainWin.SillyTavern && WA.mainWin.SillyTavern.getContext) || null;
        let recentText = '';
        if (recent) {
          try {
            const ctx = recent();
            const msgs = (ctx && ctx.chat) || [];
            recentText = msgs.slice(-4).map(m => String(m.mes || m.content || '')).join('\n').slice(-2000);
          } catch (e) {}
        }
        const block = WA.memorySampler.buildBlock({ recentText: recentText, state: s });
        if (!block) { setOut('#wa-samp-out', '采样为空——尚无人物主观记忆或采样配置为空'); return; }
        if (o) o.textContent = block;
        const cp = $('#wa-samp-copy'); if (cp) cp.disabled = false;
      } catch (e) { setOut('#wa-samp-out', '预览失败：' + (e && e.message)); }
    });
    on('#wa-samp-copy', () => {
      const o = $('#wa-samp-out');
      if (o && o.textContent) {
        try {
          if (typeof mainWin.navigator !== 'undefined' && mainWin.navigator.clipboard) mainWin.navigator.clipboard.writeText(o.textContent);
          else if (typeof mainWin.prompt === 'function') mainWin.prompt('复制以下内容：', o.textContent);
        } catch (e) {}
        setOut('#wa-samp-out', '已复制到剪贴板 ' + o.textContent);
      }
    });
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
