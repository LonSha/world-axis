/**
 * WorldAxis ui/pages/overview-blocks.js (v2.400.0) — 概览页六块只读诊断（计划 OPV22-4 第二段）
 *
 * ── 它治什么（缺口，先用现场说清）────────────────────────────────
 *   `ui/panel.js` 拆前 17420 行、约 1.11 MB，是全仓最大单文件（G7 的读数面）。
 *   本段（原 517–851 行，共 335 行、7 个函数）是「概览页六块只读诊断」：
 *   折叠壳 foldCard + 容量收纳 / 随机源 / 时间源 / 对外桥 / 记忆桥 / 引擎心跳。
 *   它们与面板其余部分的关系极弱 —— 只用到**一个**外部符号 `esc()`（段内 57 处调用），
 *   不碰 DOM、不碰事件、不产生任何 id 或控件（段内 `<button>/<input>/<select>/<textarea>`
 *   各 0 处，`id="` 0 处）。正因为如此，它是整份文件里最该先搬走的那一段：
 *   搬它不动任何一条 UI 绑定判据。
 *
 * ── 为什么「搬走」这件事极易假绿（这才是本段真正要交代的）─────────
 *   把 335 行挪到另一个文件，panel.js 变短了、语法也过了。但下面三件事**不会**因为
 *   「行数变少」而现形：
 *     ① 段体整段没被执行（面板照常渲染，只是这六块永远返回空串）；
 *     ② 段体执行了但丢了外部符号（`esc` 若不注入，六个块全部抛 ReferenceError，
 *        而 renderOverview 外层的 try/catch 会把它吞成「这六块没有内容」——
 *        **看起来完全正常**。本仓对这一族已有裁决：被吞掉的失败等于没有读数）；
 *     ③ 顺序变了（六块的拼接顺序由调用点决定，搬走后拼接表达式必须逐字保持）。
 *   故 `tests/segment-extract-v2400.js` 的 D 段专钉本段：绝对基线 + 重组自证 +
 *   符号注入双向核对 + N 组真源码破坏。
 *
 * ── 口径（三条，全部否定式）──────────────────────────────────────
 *   1 **零控件**：本模块只拼 HTML 字符串，不建 DOM、不绑事件、不产生 id。
 *      这不是「顺手」，是它能被安全搬走的前提 —— 面板的 UI 绑定守卫（G17）
 *      要求每个控件都有绑定，而本段一个控件都没有。
 *   2 **零世界写**：只读 `WA.evict / WA.rand / WA.clock / WA.bridge /
 *      WA.lonshaReader / WA.causal / WA.injectBudget / WA.perfTrace /
 *      WA.permissions` 等既有读口，没有任何 transact / draft 赋值。
 *   3 **外部依赖只走注入**：本文件顶层零 `require`、零 `module.exports`、
 *      零直接引用 panel.js 的闭包变量。段体用到的 `esc` 由 panel.js 在**调用时**
 *      经 `bind({ esc: esc })` 注入。
 *      为什么不复制一份 `esc` 过来：那会让转义有两份实现，而 v2.111.0 已把它收到
 *      `core/sanitize.js` 单一真源上（panel.js 的 esc 只是兜底壳）。
 *      为什么不 require：`ui/*.js` 全部是 IIFE 浏览器脚本，由 `vm.runInContext` 装载，
 *      没有 module 作用域 —— 与 `ui/panel-nav.js` / `ui/panel-fold.js` 同一契约
 *      （自挂 `WA.<ns>`）。
 *
 * ── 装载契约（为什么排在 ui/panel.js 之后）────────────────────────
 *   与 panel-nav / panel-fold 同款：本模块不读 panel.js 的页表，故顺序上无硬依赖；
 *   但 panel.js 的转发函数在**运行期**惰性读 `WA.panelOverviewBlocks`，所以
 *   本文件先装后装都成立（先装则首次渲染即可用，后装则首次渲染前 bind 到）。
 *   未装（无头环境不装载 ui/*）时，panel.js 的转发返回空串 —— 与 panelFold 缺席
 *   时「按展开处理」是同一条纪律：缺模块不制造停摆点。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /**
   * `esc` 的**兜底**实现（不转义，只做 null 归一）。
   *
   *   为什么允许兜底成「不转义」而不是「转义」：本文件被装载但 bind 还没被调用时，
   *   六块可能已被渲染一次（装载顺序在 panel.js 之后、首次渲染之前，但
   *   ui-gate-sync 的 fresh() 会在装载完立刻 mount）。此时若兜底成「转义」，
   *   就等于在 bind 之前凭空多出一份转义实现 —— 那正是本段要避免的第二份真源。
   *   兜底成恒等，则「bind 没接上」这件事在读数上是**可见的**（面板里出现裸 `<`），
   *   而不是静默地看起来一切正常。
   *
   *   正解是 bind 一定接上：panel.js 的每个转发函数在调用前都会先 bind 一次。
   */
  let esc = function (s) { return String(s == null ? '' : s); };

  /**
   * 注入外部符号。**幂等**：重复调用只是重复赋值同一个函数引用。
   *   返回 API 本身，便于 `WA.panelOverviewBlocks.bind({ esc: esc }).heartbeatBlock()`。
   */
  function bind(ctx) {
    if (ctx && typeof ctx.esc === 'function') esc = ctx.esc;
    return API;
  }

  // ══ 段体开始（原 ui/panel.js 517–851 行，逐字搬迁，一个字符未改）══
  function foldCard(label, summary, bodyHtml, bad) {
    return '<details class="wa-fold' + (bad ? ' wa-fold-bad' : '') + '">'
      + '<summary>' + esc(label) + '：' + summary + '</summary>'
      + '<div class="wa-fold-body">' + bodyHtml + '</div></details>';
  }
  function evictBlock() {
    try {
      const st = (WA.evict && typeof WA.evict.evictStat === 'function') ? WA.evict.evictStat() : null;
      if (!st) return '';
      if (!st.evicts && !st.evictFailed) {
        return foldCard('容量收纳', '无挤出（' + st.sites + ' 个站点在位）',
          '<div class="wa-item wa-dim">本轮尚未发生容量挤出（' + st.sites + ' 个站点在位，数据均在各自上限内）</div>');
      }
      if (st.evictFailed > 0) {
        return foldCard('容量收纳', '<span class="wa-bad">挤出失败 ' + st.evictFailed + ' 次——须改代码</span>', '<div class="wa-list">'
          + '<div class="wa-item"><b>挤出失败 ' + st.evictFailed + ' 次</b>（' + esc(JSON.stringify(st.failedBy || {}))
          + '）——站点未登记或参数非法，数据未被截断而是继续超限增长，须改代码。</div></div>', true);
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
      return foldCard('容量收纳', '挤出 ' + st.evicts + ' 次 / 丢弃 ' + st.evicted + ' 项',
        '<div class="wa-list">' + rows
        + (what ? '<div class="wa-item wa-dim">最近被挤出：' + what + '</div>' : '')
        + '</div>', st.evicted > 0);
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
    const bad = st.failed > 0 ? '<span class="wa-bad">｜参数非法 ' + st.failed + ' 次（' + esc(JSON.stringify(st.failedBy || {})) + '）</span>' : '';
    return foldCard('随机源', src + bad,
      '<div class="wa-card"><div class="wa-card-h">随机源（决策可复现性）</div>' +
      '<div class="wa-kv">种子：<b>' + src + '</b>' + bad + '</div>' +
      '<div class="wa-kv">决策抽取：' + st.draws + ' 次｜生成 id：' + st.ids + ' 个（id 走独立通道，不占用决策序列）</div>' +
      '<div class="wa-kv">通道：' + (chans || '（本会话尚未抽取）') + '</div>' +
      '<div class="wa-hint">要复现某次运行：控制台执行 <code>WorldAxis.rand.seed(数字)</code>，之后决策流同种子同序列。<br>' +
      '「同样操作两次结果不同」不是引擎不稳定——是随机源没有定住。</div></div>', st.failed > 0);
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
    const bad = st.failed > 0 ? '<span class="wa-bad">｜参数非法 ' + st.failed + ' 次（' + esc(JSON.stringify(st.failedBy || {})) + '）</span>' : '';
    const dft = st.frozen && st.drift > 60000 ? '｜与真实时刻已偏差 ' + Math.round(st.drift / 60000) + ' 分钟（冻结期间的正常现象）' : '';
    return foldCard('时间源', (st.frozen ? '已冻结' : '跟墙钟走') + bad + dft,
      '<div class="wa-card"><div class="wa-card-h">时间源（存档可复现性）</div>' +
      '<div class="wa-kv">决策时钟：' + mode + bad + '</div>' +
      '<div class="wa-kv">决策读取：' + st.nowCalls + ' 次｜测量读取：' + st.wallCalls + ' 次（耗时台账与展示，不受冻结影响）</div>' +
      '<div class="wa-kv">站点：' + (sites || '（本会话尚未读取）') + dft + '</div>' +
      '<div class="wa-hint">要复现某次运行：控制台执行 <code>WorldAxis.clock.freeze(时刻戳)</code>，之后所有进存档的时间戳都取这个虚拟时刻<br>' +
      '（每轮用 <code>WorldAxis.clock.advance()</code> 推进；<code>unfreeze()</code> 回到墙钟）。刷新页面即解除——冻结是会话内的显式动作。</div></div>', st.failed > 0);
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
    return foldCard('对外桥', (on ? '已开闸' : '休眠') + bad + warn,
      '<div class="wa-card"><div class="wa-card-h">对外桥（世界状态外供 · worldaxis_bridge_v1）</div>' +
      '<div class="wa-kv">闸门：' + mode + bad + warn + '</div>' +
      '<div class="wa-kv">发布 ' + st.publishes + ' 次｜floor=' + st.publishedFloor + '｜' + (st.snapshotBytes || 0) + ' 字节｜外部读取 ' + st.externalReads + ' 次</div>' +
      '<div class="wa-kv">作废 ' + st.invalidations + ' 次（' + (inv || '尚无') + '）｜去抖跳过 ' + st.debounced + ' 次</div>' +
      '<div class="wa-hint">这是本扩展**唯一**对外接口，与 LonSha 的 <code>lonsha_memory_bridge_v1</code> 同规格（只读投影／纯读不抛／深拷贝）。<br>' +
      '开闸：<code>WorldAxis.bridge.setSettings({ enabled: true })</code>；外部取数：<code>WorldAxis.bridge.snapshot()</code>（返回深拷贝，受 ' + st.floorGap + ' 楼间隔与去抖保护）。<br>' +
      '默认休眠的理由：快照要 clone 世界状态，无事时不该付出这份开销。</div></div>',
      (st.failures > 0) || (!on && st.externalReads > 0));
  }
  // v2.17.0: 记忆桥消费面（另一个插件记的那本账，本扩展读不读得到）——纯展示。
  //   与上面的 bridgeBlock 互为镜像：那一块讲「我发得出去吗」，这一块讲「我读得进来吗」。
  //   此前本扩展对 lonsha_memory_bridge_v1 的引用**全在注释与提示文本里**，产品代码零消费，
  //   于是「LonSha 记的今天是几号」在本扩展侧完全不可观测。这一块把它摆出来。
  function lonshaBlock() {
    let hasLonsha = false;
    try { hasLonsha = !!(WA.lonshaReader && typeof WA.lonshaReader.readLonshaSnapshot === 'function'); } catch (e) { hasLonsha = false; }
    if (!hasLonsha) {
      return foldCard('记忆桥', '<span class="wa-dim">消费面未加载</span>',
        '<div class="wa-card"><div class="wa-card-h">记忆桥（读 LonSha 账本 · lonsha_memory_bridge_v1）</div>' +
        '<div class="wa-kv">消费面未加载（读不到另一个插件记的那本账）</div></div>');
    }
    const read = WA.lonshaReader.readLonshaSnapshot({ refresh: false });
    if (!read.ok) {
      return foldCard('记忆桥', '<span class="wa-bad">不可读：' + esc(WA.lonshaReader.describeLonsha(read)) + '</span>',
        '<div class="wa-card"><div class="wa-card-h">记忆桥（读 LonSha 账本 · lonsha_memory_bridge_v1）</div>' +
        '<div class="wa-kv">不可读：' + esc(WA.lonshaReader.describeLonsha(read)) + '</div>' +
        '<div class="wa-hint">归因 <code>' + esc(String(read.reason || '?')) + '</code>——'
        + '"对方还没就绪"（稍后再读）与"对方坏了"（该查）是两件事，不该同形。<br>'
        + 'LonSha 未安装是常见合法配置；已安装却读不到，才需要看它的 <code>sourceState</code> / <code>lastError</code>。</div></div>', true);
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
    return foldCard('记忆桥', (bad ? '<span class="wa-bad">' : '') + esc(VD[d.verdict] || d.verdict) + (bad ? '</span>' : ''),
      '<div class="wa-card"><div class="wa-card-h">记忆桥（读 LonSha 账本 · lonsha_memory_bridge_v1）</div>' +
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
      'v2.18.0 起读的**不只是 `clock` 一个字段**：对方八本账 + 一本对读读数逐本看图，并对三本账报差集。</div></div>', bad);
  }
  // ── v2.124.0（优化计划 P6）：引擎心跳（三源聚合 · 一页答「引擎在不在转」）──
  //   治的病：玩家根本不知道引擎在不在转 —— 「这扩展有用吗」在界面上答不出。
  //   R105 治的是**机制层**不可判定（导出了却零消费），P6 治的是**玩家层**：
  //   三源都已是既有真消费方（perf-trace 在诊断节与档位面按钮、causal.stateView 在因果
  //   工作台、inject-budget.costView 在注入预算裁决段），本块只是把它们**并排**放到概览页。
  //
  //   三条纪律（与 evictBlock / randBlock / clockBlock / bridgeBlock / lonshaBlock 同款）：
  //     · **纯展示、零控件** —— 不引入任何 id/按钮，故不触碰 UI 绑定守卫与接线门禁；
  //       需要动作时去对应页（因果工作台 / 档位面按钮 / 诊断页）。
  //     · **缺模块时如实说缺**，不返回空串装作「没什么可报」（那是本仓点名的「没有这条记录」
  //       与「当时确实是零」同形）。三源逐一降级，缺哪一个由哪一句说。
  //     · **不编造读数**：宿主 API 耗时在无头/未上报环境一律写「未上报」，绝不拿 0ms
  //       冒充「API 很快」（P4 在 `bandCompare` 的 `apiNote` 里登记过的同一条）。
  function heartbeatBlock() {
    const out = [];
    // v2.254.0: 摘要染红旗（劣化源 / 三源读取失败都要点亮折叠壳摘要行）
    let __hbBad = false;
    // v2.254.0b: ① 段读到的因果链读数**提出来给摘要复用** ——
    //   此前摘要自己再读一次 causal.stateView()。两次读之间世界可能已推进，
    //   于是「明细说 3 条、摘要说 0 链」自相矛盾 —— 那是折叠方案自己制造的新矛盾。
    //   提出来复用 ⇒ 只读一次，明细与摘要必然一致（读数只读一次这条纪律的延伸）。
    let __cv = null;
    // ① 世界链在不在走（causal.stateView —— 纯读存档，不推进世界）
    try {
      const cv = (WA.causal && typeof WA.causal.stateView === 'function') ? WA.causal.stateView() : null;
      __cv = cv;
      if (!cv) out.push('<div class="wa-kv">世界链：<span class="wa-dim">因果模块未装载</span></div>');
      else {
        const byS = Object.keys(cv.byStatus || {}).filter(function (k) { return cv.byStatus[k] > 0; })
          .map(function (k) { return k + '×' + cv.byStatus[k]; }).join('、');
        out.push('<div class="wa-kv">世界链：共 <b>' + esc(String(cv.chains == null ? '?' : cv.chains)) + '</b> 条'
          + '｜<b>' + esc(String(cv.live)) + '</b> 进行中 / <b>' + esc(String(cv.terminal)) + '</b> 已终结'
          + (byS ? '<span class="wa-dim">（' + esc(byS) + '）</span>' : '')
          + (cv.pending ? '<span class="wa-dim">｜待结算 ' + esc(String(cv.pending)) + '</span>' : '')
          + (cv.scheduledDelayed ? '<span class="wa-dim">｜延后 ' + esc(String(cv.scheduledDelayed)) + '</span>' : '')
          + '</div>');
      }
    } catch (e) { __hbBad = true; out.push('<div class="wa-kv">世界链：<span class="wa-dim">读取失败（' + esc(e && e.message) + '）</span></div>'); }
    // ② 本轮注入在不在转（lastInjection.budget.cost + lastInjection.recalc —— 既有真源）
    try {
      const li = (WA.store && WA.store.get) ? (WA.store.get().lastInjection || null) : null;
      if (!li) out.push('<div class="wa-kv">本轮注入：<span class="wa-dim">尚未发生注入（推演一轮后此处显示本轮读数）</span></div>');
      else {
        const cv = (WA.injectBudget && WA.injectBudget.costView) ? WA.injectBudget.costView(li.budget && li.budget.cost) : null;
        const sp = (WA.perfTrace && typeof WA.perfTrace.split === 'function') ? WA.perfTrace.split() : null;
        const bits = [];
        if (cv && cv.planned) {
          bits.push('耗时 <b>' + esc(String(cv.totalMs)) + 'ms</b>');
          bits.push(esc(String(cv.measured)) + ' 源计入');
        } else bits.push('<span class="wa-dim">本轮无成本账（无可裁项或旧存档快照）</span>');
        if (sp) {
          bits.push('本地 ' + esc(String(sp.localMs)) + 'ms');
          bits.push('序列化 ' + esc(String(sp.serializeMs)) + 'ms');
          // 「未上报」与「0ms」必须分得开（P4 的 apiNote 同一条口径）
          bits.push('宿主 ' + ((sp.declared && sp.declared.host) ? esc(String(sp.hostMs)) + 'ms' : '<span class="wa-dim">未上报</span>'));
        }
        out.push('<div class="wa-kv">本轮注入：' + bits.join('｜') + '</div>');
        const rc = li.recalc || null;
        if (rc) {
          out.push('<div class="wa-kv">局部重算：重算 <b>' + esc(String(rc.touchedCount)) + '</b> 源 / 跳过 <b>'
            + esc(String(rc.untouchedCount)) + '</b> 源<span class="wa-dim">（源面 ' + esc(String(rc.knownCount)) + '）'
            + '｜脏键 ' + esc((rc.dirtyKeys || []).length ? (rc.dirtyKeys || []).join('、') : '无') + '</span></div>');
        }
      }
    } catch (e) { __hbBad = true; out.push('<div class="wa-kv">本轮注入：<span class="wa-dim">读取失败（' + esc(e && e.message) + '）</span></div>'); }
    // ③ 基准对照面（dryRun：**只报结构面**，不跑任何一档 —— 看一眼概览页不该等于跑一轮基准）
    try {
      const bc = (WA.perfTrace && typeof WA.perfTrace.bandCompare === 'function') ? WA.perfTrace.bandCompare({ dryRun: true }) : null;
      if (!bc) out.push('<div class="wa-kv">基准档位：<span class="wa-dim">性能模块未装载</span></div>');
      else {
        out.push('<div class="wa-kv">基准档位：四档结构面在场（' + esc((bc.judgeableClasses || []).join('/')) + ' 可判'
          + ((bc.approxClasses || []).length ? '、' + esc((bc.approxClasses || []).join('/')) + ' 仅估计' : '')
          + '）｜判定门槛 ' + esc(String(bc.minSamples)) + ' 样本'
          + '<span class="wa-dim">（本格为结构面：毫秒读数随机器漂移，要真跑请去「档位面」按钮）</span></div>');
      }
    } catch (e) { out.push('<div class="wa-kv">基准档位：<span class="wa-dim">读取失败（' + esc(e && e.message) + '）</span></div>'); }
    // ④ v2.124.0（P5）落地面：删除闸门到底在不在挡（与 P5 同一版交付的可见面）
    //    没有这一格，P5 的「delete 位接进删除出口」只能靠读源码验证 —— 玩家与制作者都看不见。
    try {
      const gs = (WA.permissions && typeof WA.permissions.gateStat === 'function') ? WA.permissions.gateStat() : null;
      if (!gs) out.push('<div class="wa-kv">删除闸门：<span class="wa-dim">权限模块未装载</span></div>');
      else {
        const byA = gs.byAction || {};
        const line = function (k) {
          const b = byA[k];
          if (!b) return k + ' 未判定';
          return k + ' 判定 ' + b.gates + '（拒 ' + b.denied + '／闸门未启用 ' + b.off + '）';
        };
        const rmS = (WA.store && typeof WA.store.removeStat === 'function') ? (function () { try { return WA.store.removeStat(); } catch (e) { return null; } })() : null;
        const rmB = (WA.settingsBus && typeof WA.settingsBus.removeStat === 'function') ? (function () { try { return WA.settingsBus.removeStat(); } catch (e) { return null; } })() : null;
        const blocked = (rmS ? (rmS.denied || 0) : 0) + (rmB ? (rmB.removeDenied || 0) : 0);
        out.push('<div class="wa-kv">删除闸门：' + (gs.active
          ? '<b>' + esc(String(gs.user)) + '</b> 在用'
          : '<span class="wa-dim">未启用（单机默认放行；登记使用者后写/删路径才过闸门）</span>')
          + '<span class="wa-dim">｜' + esc(line('write')) + '｜' + esc(line('delete')) + '</span></div>');
        if (blocked > 0) { __hbBad = true; out.push('<div class="wa-kv wa-bad">删除出口已拦下 ' + esc(String(blocked)) + ' 次'
          + '<span class="wa-dim">（被拦下的删除一个字节都没碰存储）</span></div>'); }
      }
    } catch (e) { __hbBad = true; out.push('<div class="wa-kv">删除闸门：<span class="wa-dim">读取失败（' + esc(e && e.message) + '）</span></div>'); }
    // ④ 性能在不在慢下来（perfLedger.trend —— 纯读内存台账，不计时、不落盘）
    //   v2.148.0（RP1）：三源答「在不在转」，第四源答「一直在变慢吗」——
    //   本轮 3ms 与 200 轮前的 3ms 长得一样，但斜率知道区别。
    try {
      const pl = (WA.perfLedger && typeof WA.perfLedger.trend === 'function') ? WA.perfLedger.trend() : null;
      if (!pl) {
        out.push('<div class="wa-dim">④ 性能趋势：perf-ledger 未加载（性能历史台账缺席）</div>');
      } else if (!pl.ok) {
        out.push('<div class="wa-dim">④ 性能趋势：' + esc(pl.reason || 'unknown') + '</div>');
      } else {
        if (pl.degrading > 0) __hbBad = true;
        const st = WA.perfLedger.stat();
        const top = pl.rows.length ? pl.rows[0] : null;
        // 退场归因行（只在真退过东西时出现）：只报「N 源在记」会盖掉「有样本被退」，
        //   而「退得多」才是要查的信号——源数超限该调容量，参数违约该修生产方。
        const sr = st.skipReasons || {};
        const srKeys = Object.keys(sr).filter(function (k) { return sr[k] > 0; });
        out.push('<div>④ 性能趋势：<b>' + st.sources + '</b> 源在记 · ' + st.recorded + ' 样本 · '
          + (pl.degrading > 0
            ? ('<b class="wa-warn">' + pl.degrading + ' 个源在劣化</b>（斜率 &gt; 阈值）——最陡：' + esc(top.source) + ' ' + top.slope + 'ms/样本')
            : '零劣化源（所有源斜率 ≤ 阈值或样本不足）')
          + '</div>');
        if (srKeys.length) {
          out.push('<div class="wa-kv wa-dim">④b 未入账归因：'
            + srKeys.sort(function (a2, b2) { return sr[b2] - sr[a2]; })
              .map(function (k) { return esc(k) + ' ×' + sr[k]; }).join(' · ')
            + '</div>');
        }
      }
    } catch (e) {
      __hbBad = true;
      out.push('<div class="wa-dim">④ 性能趋势：读取抛错（' + esc(String(e && e.message || e)) + '）</div>');
    }
    // v2.254.0: 摘要行 —— 只答「在不在说事」：世界链 / 注入耗时 / 档位可判 / 闸门 / 劣化源。
    //   全零与未装载是**默认态**，不该占一屏；但异常（读取失败、劣化、拦截）要在这行上看得见。
    let sum = '<span class="wa-dim">未转</span>';
    const hBad = __hbBad;
    // 摘要复用 ① 段已读到的真值（不二次读 ⇒ 明细与摘要不会互相打架）；
    //   读不到就是「未转」，不编、不炸（① 段的 catch 已把读取失败记成坏态）。
    if (__cv) sum = esc(String(__cv.chains == null ? '?' : __cv.chains)) + ' 链 / ' + esc(String(__cv.live)) + ' 进行中';
    const sumLine = '世界链 ' + sum + ' · <span class="wa-dim">读数与闸门点开看</span>';
    return foldCard('引擎心跳', sumLine,
      '<div class="wa-card"><div class="wa-card-h">引擎心跳（四源聚合 · 只读）</div>'
      + out.join('')
      + '<div class="wa-hint">三行分别答：<b>世界链在不在走</b>（因果链条数与状态）、'
      + '<b>本轮注入在不在转</b>（耗时与局部重算）、<b>基准够不够判</b>（四档结构是否在场）。<br>'
      + '全部只读、零动作：真正的操作入口在「因果工作台」「档位面」「增量面」与「诊断」页。<br>'
      + '「未上报」与「0ms」是两件事 —— 宿主 API 耗时无上报时照实写未上报，不拿 0ms 冒充「API 很快」。</div></div>', hBad);
  }
  /**
   * ══ v2.400.0（EXV22-9）：V22 八项制度性读数同屏 ══
   *
   * 为什么这一块必须存在（不是「顺手加个面板」）：
   *   EXV22-1～8 八个引擎交付时全是**零读 ns** —— module-cycle-gate 当场点名
   *   八条「模块提供了、产品源面无人读」。而本仓对这件事有硬纪律：
   *   零读 ns 要么补真实消费点，要么在 ns-consumer-ledger 里写清「为什么只该
   *   由程序/宿主消费」。把八项制度读数登记成 readonly-api 是自欺 ——
   *   它们的使命正是「让玩家看见历法漂了几天、驿路断在哪、这一季逼走了几户」，
   *   看不见就等于白做。故本块就是那八个 ns 的**真实生产消费点**。
   *
   * 三条口径（与前六块同源，一条不松）：
   *   ① **只读、零动作**：只调各引擎的 `view()` 与 `getSettings()`，
   *      **绝不**调 observeSky / levySeason / holdFuneral 这类会改状态的写口 ——
   *      看诊断不该凭空给世界办一场丧事。这一条由 tests/exv22-v2400.js 的正则钉住。
   *   ② **缺席即缺席**：任一引擎不在（旧宿主/按需装载）就如实写「未装载」，
   *      不补默认读数、不假装 0。八个块各自独立，一个缺席不拖累其余。
   *   ③ **不新增控件**：本块零 `<button>`/`<input>`/`id="`，故不触碰面板的
   *      UI 绑定守卫（G17）。渲染期只拼字符串。
   */
  function v22OmensBlock() {
    const rows = [];
    let bad = false;

    // ══ 为什么这里要**逐条直写** `WA.<ns>.view` 而不做 `WA[sp.ns]` 动态取 ══
    //   module-cycle-gate 的读面（tests/inventory.js 的 codeFace）是**静态正则**，
    //   只认 `WA.<ns>.<mem>` 字面形态。初版我用 `const m = WA[sp.ns]` 做了一张
    //   SPEC 表，测试真跑得通、面板真的显示八行，但门禁读数是「读面 453」纹丝不动
    //   —— 也就是说：**在人眼里已经接上了，在判据眼里还没接**。
    //   这种「看得见但读不出」正是本仓反复治的假绿反向（假消费点）。
    //   处置不是去放宽门禁的正则（那会让真漏接也一起放过），而是把消费点写成
    //   门禁能看见的形态：下面这八行就是那八个 ns 的真读点，一个不多一个不少。
    //   每条都只调 `view()`（只读口），**不调**任何会改状态的写口。
    const READERS = [
      { label: '星象历差', ns: 'celestialOmens', read: function () { return WA.celestialOmens.view(); } },
      { label: '驿传时延', ns: 'postalRelay', read: function () { return WA.postalRelay.view(); } },
      { label: '征发逃户', ns: 'levyCorvee', read: function () { return WA.levyCorvee.view(); } },
      { label: '服丧禁令', ns: 'mortuaryRites', read: function () { return WA.mortuaryRites.view(); } },
      { label: '僭越风险', ns: 'sartorialRegalia', read: function () { return WA.sartorialRegalia.view(); } },
      { label: '联姻绑定', ns: 'betrothalAlliance', read: function () { return WA.betrothalAlliance.view(); } },
      { label: '舆图精度', ns: 'cartographySurvey', read: function () { return WA.cartographySurvey.view(); } },
      { label: '误译后果', ns: 'linguaBroker', read: function () { return WA.linguaBroker.view(); } }
    ];

    // 每一行如何从 view() 的读数里取一句话。取不到就如实写「未…」，不编。
    const FORMAT = {
      celestialOmens: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（设置页可开）' };
        if (v.year == null) return { sum: '未观星', note: '尚未 observeSky：没有读数，不猜历差' };
        return {
          sum: '历差 ' + v.driftDays + ' 日 · ' + (v.sky ? v.sky.phase : '?'),
          note: '第 ' + v.year + ' 年 · 阈值 ' + v.alarmDays + ' 日 / 年漂 ' + v.driftDaysPerYear
        };
      },
      postalRelay: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（设置页可开）' };
        if (!v.routeIds.length) return { sum: '无驿路', note: '尚未 buildRoute：没有拓扑就算不出时延' };
        return {
          sum: v.routeIds.length + ' 条驿路',
          note: '驿马 ' + v.horseKmPerHour + ' km/h · 每站换马 ' + v.relayHoursPerStation + 'h · 已派 ' + v.stat.dispatched
        };
      },
      levyCorvee: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（设置页可开）' };
        if (!v.ledgerCount) return { sum: '未征发', note: '尚无 levySeason 记录' };
        const L = v.last;
        return {
          sum: '实征 ' + L.got + ' / 应征 ' + L.want,
          note: '逃户 ' + L.fled + ' · 基数 ' + L.households + '→' + L.baseAfter
            + (L.shortfall > 0 ? ' · <b>收不满 ' + L.shortfall + '</b>' : '')
        };
      },
      mortuaryRites: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（设置页可开）' };
        if (!v.mourners.length) return { sum: '无人服丧', note: '尚无 holdFuneral 记录' };
        const soon = v.mourners.slice().sort(function (a, b) { return a.until - b.until; })[0];
        return {
          sum: v.mourners.length + ' 人服丧',
          note: '最近期满者 ' + soon.kin + ' / ' + soon.days + ' 日 · 禁 ' + v.bans.join('、')
            + ' · 已拦 ' + v.stat.blocked
        };
      },
      sartorialRegalia: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（设置页可开）' };
        if (!v.worn.length) return { sum: '无人着装', note: '尚无 attireAs 记录' };
        const us = v.worn.filter(function (w) { return w.usurping; });
        return {
          sum: us.length + ' 人僭越',
          note: '着装 ' + v.worn.length + ' 人 · 盘查力 ' + v.gateScrutiny
            + ' · 已识破 ' + v.stat.caught + ' / 已放行 ' + v.stat.passed
        };
      },
      betrothalAlliance: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（设置页可开）' };
        if (!v.proposals.length) return { sum: '无婚约', note: '尚无 proposeMatch 记录' };
        const settled = v.proposals.filter(function (p) { return p.state === 'settled'; }).length;
        const best = v.ties.slice().sort(function (a, b) { return b.strength - a.strength; })[0];
        return {
          sum: settled + ' 门亲事已定',
          note: '提案 ' + v.proposals.length + ' · 悔婚 ' + v.stat.broken
            + (best ? ' · 最深绑定 ' + best.houses + ' ' + best.strength : '')
        };
      },
      cartographySurvey: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（设置页可开）' };
        if (!v.regions.length) return { sum: '未测绘', note: '尚无 chartRegion 记录' };
        const worst = v.regions.slice().sort(function (a, b) { return a.precision - b.precision; })[0];
        const guessed = v.regions.reduce(function (a, r) { return a + r.heard; }, 0);
        return {
          sum: v.regions.length + ' 片有图',
          note: '最粗 ' + worst.regionId + ' 精度 ' + worst.precision + ' / 误差 ±' + worst.errorRadiusKm + 'km'
            + ' · <b>猜的点 ' + guessed + '</b> · 走错 ' + v.stat.misled
        };
      },
      linguaBroker: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（设置页可开）' };
        if (!v.stat.talks) return { sum: '未交谈', note: '尚无 converse 记录' };
        return {
          sum: '误译 ' + v.stat.misreads + ' / 交谈 ' + v.stat.talks,
          note: '方言 ' + v.tongues.length + ' 种 / 语族 ' + v.families.length
            + ' · 跨族基础误译率 ' + v.misreadPerDistance
        };
      }
    };

    READERS.forEach(function (sp) {
      let sum = '未装载';
      let note = 'WA.' + sp.ns + ' 不在场：本块如实写缺席，不补默认读数';
      try {
        const v = sp.read();
        const r = FORMAT[sp.ns](v);
        sum = r.sum; note = r.note;
      } catch (e) {
        bad = true;
        sum = '读取失败';
        note = esc(e && e.message ? e.message : String(e));
      }
      const cls = /休眠|未|无/.test(sum) ? 'wa-dim' : '';
      rows.push('<div class="wa-kv"><span>' + esc(sp.label) + '</span>'
        + '<span class="' + cls + '">' + esc(sum) + '</span></div>'
        + '<div class="wa-dim" style="font-size:11px;margin:-2px 0 4px 0;">' + note + '</div>');
    });

    return foldCard('V22 制度读数', rows.length + ' 项 <span class="wa-dim">（八项同屏 · 只读）</span>',
      '<div class="wa-card"><div class="wa-card-h">V22 拓展线：八项制度性读数（只读）</div>'
      + rows.join('')
      + '<div class="wa-hint">八项各自答一件事：<b>历法漂了几天</b>（星象→农时→减产）、'
      + '<b>军情为什么迟</b>（驿路拓扑→换马→断毁）、<b>国库为何越收越穷</b>（超额→逃户→基数变小）、'
      + '<b>死亡的社会成本</b>（服丧期→禁令）、<b>穿错衣服的代价</b>（僭越→盘查）、'
      + '<b>联姻把两家绑多紧</b>（门第差→妆匛→悔婚）、<b>这张图有几个点是猜的</b>（精度→走错）、'
      + '<b>话被听成了什么</b>（方言距离→掮客→误译）。<br>'
      + '全部只读、零动作：真正的操作入口在各引擎自己的写口；'
      + '本块<b>绝不</b>代为征发、办丧、定罪或宣战。<br>'
      + '「休眠」与「未装载」是两件事 —— 前者是开关关着（设置页可开），'
      + '后者是模块本身不在场，照实分开写。</div></div>', bad);
  }
  // ══ V23 缝合线：异空间三缝只读读数（v2.402.0）═════════════════════════════
  /**
   * 异空间 V1.4 缝进来的三个账本引擎的只读面板块。
   *
   * ── 为什么这一块必须存在（与上面 v22OmensBlock 同一条理由）────────
   *   三个引擎的导出若只被 tests 读，dead-export-gate 会逐条报 self-only /
   *   unwired。那不是误报 —— 「能算但没人看得见」的账本就是死的。但是：
   *   它们的**写口**（begin/end/compose/hide/enforce）不该由面板代按，
   *   所以本块只接 `view()` / `getSettings()` 两个只读口，写入口留在 action-desk。
   *
   * ── 三条口径（与 V22 那八行逐字同源）──────────────────────────
   *   ① **只读、零动作**：只调 view() 与 getSettings()。本块**绝不**调
   *      end() / enforce() / hide() —— 「看诊断」不该顺手替玩家结束一段演绎，
   *      更不该替他把聊天文件列进待删清单（那个动作不可撤销）。
   *   ② **缺席即缺席**：任一引擎不在场就如实写「未装载」，不补默认读数、
   *      不假装 0。三个块各自独立，一个缺席不拖累其余。
   *   ③ **不新增控件**：零 `<button>` / `<input>` / `id="`，不触碰 UI 绑定守卫。
   *
   * ── 直写 `WA.<ns>.view()` 而不做 `WA[ns].view()` 动态取 ────────────
   *   与 V22 那段的教训逐字相同：module-cycle-gate 的读面是**静态正则**，
   *   只认 `WA.<ns>.<mem>` 字面形态。用表驱动写成 `WA[sp.ns].view()` 时，
   *   人眼里已经接上了、判据眼里还没接 —— 那是假消费点。
   */
  function v23StitchBlock() {
    const rows = [];
    let bad = false;

    const READERS = [
      { label: '小剧场', ns: 'stageSession', read: function () { return WA.stageSession.view(); } },
      { label: '记忆互通', ns: 'memoryRelay', read: function () { return WA.memoryRelay.view(); } },
      { label: '聊天回收站', ns: 'chatRecycle', read: function () { return WA.chatRecycle.view(); } }
    ];

    // 每行怎么从 view() 的读数里说一句话。取不到就如实写「未…」，不编。
    const FORMAT = {
      stageSession: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（action-desk 的 stage.* 路由仍可调用）' };
        if (!v.sessions.length) return { sum: '未开场', note: '还没有 begin 过任何小剧场' };
        const a = v.active;
        const arch = v.sessions.filter(function (s) { return s.state === 'archived'; }).length;
        return {
          sum: a ? ('演绎中：' + a.title) : '无进行中',
          note: '会话 ' + v.sessions.length + ' 段 · 已存档 ' + arch
            + ' · 回收索引 ' + v.trash.count
            + (a ? (' · 已进行 ' + a.blocks + ' 块') : '')
        };
      },
      memoryRelay: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（action-desk 的 relay.* 路由仍可调用）' };
        const targets = Object.keys(v.attached || {});
        const n = targets.reduce(function (a, k) { return a + v.attached[k].length; }, 0);
        if (!v.relays || !v.relays.length) return { sum: '无摘要', note: '还没有 compose 过跨聊天摘要' };
        return {
          sum: '摘要 ' + v.relays.length + ' 条 / 挂载 ' + n,
          note: '挂到 ' + targets.length + ' 段聊天 · <b>只传摘要，不合并原文</b>'
        };
      },
      chatRecycle: function (v) {
        if (!v.enabled) return { sum: '休眠', note: '开关关着（action-desk 的 recycle.* 路由仍可调用）' };
        const locked = v.items.filter(function (it) { return it.locked; }).length;
        if (!v.count) return { sum: '回收站空', note: '没有移入过聊天文件' };
        return {
          sum: v.count + ' / ' + v.limit,
          note: '锁定 ' + locked + ' 个已保护'
            + (v.nextPurge && v.nextPurge.length
              ? (' · <b>超限待清 ' + v.nextPurge.length + ' 个（最旧未锁定）</b>')
              : ' · 未超限')
            // 这句话是给玩家看的硬边界：本模块不删，删必须由宿主执行。
            + ' · 本面板只读数、<b>不删除任何文件</b>'
        };
      }
    };

    READERS.forEach(function (sp) {
      let sum = '未装载';
      let note = 'WA.' + sp.ns + ' 不在场：本块如实写缺席，不补默认读数';
      try {
        const v = sp.read();
        const r = FORMAT[sp.ns](v);
        sum = r.sum; note = r.note;
      } catch (e) {
        bad = true;
        sum = '读取失败';
        note = esc(e && e.message ? e.message : String(e));
      }
      const cls = /休眠|未|无/.test(sum) ? 'wa-dim' : '';
      rows.push('<div class="wa-kv"><span>' + esc(sp.label) + '</span>'
        + '<span class="' + cls + '">' + esc(sum) + '</span></div>'
        + '<div class="wa-dim" style="font-size:11px;margin:-2px 0 4px 0;">' + note + '</div>');
    });

    return foldCard('V23 缝合线', rows.length + ' 项 <span class="wa-dim">（三缝同屏 · 只读）</span>',
      '<div class="wa-card"><div class="wa-card-h">V23 缝合线：异空间三缝读数（只读）</div>'
      + rows.join('')
      + '<div class="wa-hint">三件事各自答一个问题：<b>现在在演哪一段</b>（小剧场会话）、'
      + '<b>这段聊天知道多少别处的事</b>（跨聊天摘要）、<b>回收站还能再装几个</b>（文件上限 10）。<br>'
      + '三件都必须说清的两条硬边界：<b>记忆互通只传摘要，不合并两份完整聊天</b>；'
      + '<b>回收站超限时最旧且未锁定的会被彻底删除</b> —— 所以重要聊天请先在列表里锁定，'
      + '而本块<b>只负责读数，不替你锁定、也不替你删除</b>。<br>'
      + '「休眠」是开关关着（设置页可开），「未装载」是模块本身不在场 —— 两件事分开写。</div></div>', bad);
  }
  // ══ 段体结束 ══
  //   v2.400.0（V22 后续修正）：EXV22-9 当初把本块写在了段体标记**之外**，
  //   后果是重组面（panelSource() 还原的「假如没拆」的 panel.js）里挂载行
  //   调用 v22OmensBlock() 却没有定义 —— overview-fold-v2254 的负控制当场
  //   ReferenceError。段体标记是拆段契约的边界，不是装饰；本次把标记移回
  //   函数之后，段体 335 → 491 行（esc 57 → 60 处），拆段锁读数同步更新。
  const API = {
    foldCard: foldCard,
    evictBlock: evictBlock,
    randBlock: randBlock,
    clockBlock: clockBlock,
    bridgeBlock: bridgeBlock,
    lonshaBlock: lonshaBlock,
    heartbeatBlock: heartbeatBlock,
    v22OmensBlock: v22OmensBlock,
    v23StitchBlock: v23StitchBlock,
    bind: bind,
    ver: '2.400.0'
  };
  WA.panelOverviewBlocks = API;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/overview-blocks.js', { kind: 'ui', ver: '2.400.0' });
  }
})();
