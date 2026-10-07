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
    // v2.96.0（X3）：传播与辟谣。与 SOURCES 同批登记——只加源表不加显示名 ⇒
    //   注入页/导演页会裸露英文键名 `rumor`，而那是用户唯一能开关它的地方。
    rumor: '传开的与亲眼见的',
    // v2.99.0：原著幕目。与 SOURCES 同批登记——只加源表不加显示名 ⇒
    //   注入页/导演页裸露英文键名 `canon`，而那是用户唯一能开关它的地方。
    //   （另有同名风险：舆情面内部还有一个 `opinion.canon`，但那是**状态键**不是注入源，
    //   不会出现在 SOURCES 里，两者不存在键集冲突。）
    canon: '原著幕目',
    // v2.117.0（计划二 B1 主体）：人物行动。与 SOURCES 同批登记 ——
    //   只加源表不加显示名 ⇒ 注入页/导演页裸露英文键名 `act`，
    //   而那是用户唯一能开关它的地方（本版实测被 inject-sources-v2560 的 D 判据抓出）。
    act: '人物行动',
    // v2.66.0: 情绪通道 / 关系六型 / 假面。与 SOURCES 同批登记（不加显示名 ⇒ 面板裸露英文键名）。
    affect: '情绪通道', bonds: '关系六型', masks: '假面', temporalLock: '时间锁', temperament: '双层性格', fondness: '好感审计', parallelEvents: '场外事件',
    eraCycle: '资料片周期', survival: '生存三轴', warrant: '通缉', beastBond: '驯兽',
    appearance: '外貌契约', ladder: '原型阶梯', sceneSlice: '情境切片', gauge: '阻尼量规', rivalry: '竞争焦点', enigma: '信息暗礁', tempo: '节奏齿轮', quota: '伏笔配给', spotlight: '焦点分配', karma: '业力双轴', hazard: '累积风险', marginal: '边际折旧', tolerance: '手段耐受', events: '事件调度', checkpoints: '快照与分支',
    // v2.119.0（拓展计划 ①②）：人物多步计划 / 关系修复。与 SOURCES 同批登记 ——
    //   只加源表不加显示名 ⇒ 注入页/导演页裸露英文键名 `plan`/`mend`，
    //   而那是用户唯一能开关这两个注入源的地方（同 v2.56.0 / v2.96.0 / v2.117.0 的理由）。
    plan: '人物计划', mend: '关系修复',
    // v2.119.0（拓展计划 ③）：供需循环。与 SOURCES 同批登记（否则注入页裸露英文键名 `economy`）。
    economy: '供需与商路', inst: '组织制度', probe: '调查卷宗', region: '远方', stage: '玩法进度', session: '多人场',
    // v2.127.0（X2）：世界编年史。与 SOURCES 同批登记 ——
    //   只加源表不加显示名 ⇒ 注入页/导演页裸露英文键名 `chrono`，
    //   而那是用户唯一能开关它的地方（同 v2.56.0 / v2.96.0 / v2.117.0 的理由）。
    // v2.129.0（缝 A1/A4/A5/A6/A8）：五条叙事纪律源。与 SOURCES 同批登记 ——
    //   只加源表不加显示名 ⇒ 注入页/导演页裸露英文键名，而那是用户唯一能开关它的地方。
    //   插在 chrono 行**之前**（而非其后）：chrono 行是 v2.127.0 那条锁的锚点字面量，
    //   改动它会同时触发 anchor-scan 与负控制审计的 not-unique（实测踩过）。
    userlock: '用户锁定', rhythmLoop: '节奏环', motif: '文体档案', beatMask: '信息迷雾', powerAnchor: '战力锚',
    // v2.130.0（拓展计划 A4 / C2）：两条新注入源。与 SOURCES 同批登记 ——
    //   只加源表不加显示名 ⇒ 注入页/导演页裸露英文键名，而那是用户唯一能开关它的地方。
    //   插在 chrono 行**之前**（而非其后）：chrono 行是 v2.127.0 那条锁的锚点字面量，
    //   改动它会同时触发 anchor-scan 与负控制审计的 not-unique（实测踩过）。
    reasoning: '思考开销', storyTone: '剧情倾向',
    // v2.135.0（E6）：伏笔台账。与 SOURCES 同批登记 ——
    //   只加源表不加显示名 ⇒ 注入页/导演页裸露英文键名，而那是用户唯一能开关它的地方。
    //   插在 chrono 行**之前**（而非其后）：chrono 行是 v2.127.0 那条锁的锚点字面量，
    //   改动它会同时触发 anchor-scan 与负控制审计的 not-unique（实测踩过）。
    foreshadow: '伏笔台账',
    // v2.140.0（F1）：防全知闸门。与 SOURCES 同批登记 —— 只加源表不加显示名 ⇒
    //   注入页/导演页裸露英文键名 noesis（本版被 v2.22.0 renderDirector 键集判据抓出）。
    //   插在 chrono 行之前（与 foreshadow 同款理由：chrono 行是 v2.127.0 锚点区）。
    noesis: '知情边界',
    // v2.141.0（F2）：生理与照护真实层。缺此项 ⇒ inject-sources-v2560 的 D 判据当场红灯
    //   （SOURCES 每一项在 VIS_NAMES 里都要有显示名）。
    lifeline: '生理与照护',
    // v2.142.0（F3）：视角锁。与 SOURCES 同批登记 —— 只加源表不加显示名 ⇒
    //   注入页/导演页裸露英文键名 perspective（本版被 v2.22.0 renderDirector 键集判据与
    //   inject-sources-v2560 的 D 判据当场抓出）。插在 chrono 行之前（与 foreshadow /
    //   noesis 同款理由：chrono 行是 v2.127.0 锚点区，改动它会触发 anchor-scan not-unique）。
    perspective: '视角锁',
    // v2.149.0（X1）：世界沉积层。与 SOURCES 同批登记 —— 只加源表不加显示名 ⇒
    //   注入页/导演页裸露英文键名 sediment，而那是用户唯一能开关它的地方
    //   （同 v2.56.0 / v2.96.0 / v2.117.0 / v2.142.0 的理由）。插在 chrono 行之前
    //   （chrono 行是 v2.127.0 那条锁的锚点字面量，改动它会触发 anchor-scan not-unique）。
    // v2.151.0（RX2+RX3）：两条新注入源的显示名。与 SOURCES 同批登记 ——
    //   只加源表不加显示名 ⇒ 注入页/导演页裸露英文键名，而那是用户唯一能开关它的地方。
    offlineTick: '你不在时', farfield: '远方的脉搏',
    // v2.155.0 收口（全量回归当场抓到）：worldBridge 是 v2.154.0 新增的注入源。
    //   源表（render/inject.js 的 SOURCES）与注入分支、SRC_NAME、SRC_MOD_SETTING 四处都同批登记了，
    //   唯有**面板显示名**这一处漏了 —— 而面板是用户唯一能开关它的地方（注入页/导演页会裸露英文键名）。
    //   同 v2.56.0 / v2.96.0 / v2.117.0 / v2.142.0 / v2.149.0 的理由 —— D 判据两向都锁：漏名与悬空名。
    worldBridge: '远方的传说',
    // v2.165.0（TX1）：势力外交事实面。与 SOURCES / 注入分支 source 名 / SRC_NAME 同批 ——
    //   只加源表不加显示名 ⇒ 注入页/导演页裸露英文键名 diplomacy，而那是用户唯一能开关它的地方。
    diplomacy: '外交事实',
    agency: '行动调度',
    freight: '货运在途',
    storyChoice: '故事分支',
    sediment: '此地沉积',
    chrono: '世界编年史' };

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
    // v2.149.0（X1）：世界沉积层。**插在 inject 之后而非 world 之后**：pages[3..6]
    //   是 v2.33.0/v2.34.0 两条硬读数（memory/enemies/parallel/inject）锚定的位置，
    //   插在 people 之后会把它们整体后移一位，那是与本次改动无关的读数抖动。
    { id: 'sediment', icon: '⛰', label: '沉积' },
    // v2.151.0（RX2）：跨会话记忆锚与远方世界脉搏。同样插在 sediment 之后：
    //   pages[3..6]（memory/enemies/parallel/inject）是 v2.33.0/v2.34.0 两条硬读数
    //   锁定的位置，插在它们之前会把整体后移一位（与本次改动无关的读数抖动）。
    //   远方地图（RX3）不新增页签：挂在既有「世界」页
    //   （同 v2.124.0 心跳块挂概览页的惯例）。
    { id: 'offline', icon: '⏳', label: '会话' },
    // v2.154.0（RX4+RX7）：世界联网面与生态自洽审计。同样插在既有页**之后**（offline 之后）：
    //   pages[3..6]（memory/enemies/parallel/inject）是 v2.33.0/v2.34.0 两条硬读数锁定的位置，
    //   插在它们之前会把整体后移一位（与本次改动无关的读数抖动）。
    //   两块合页而不是各开一页：它们回答的是**同一件事的两个方向** ——
    //   「这片世界与外面通着吗」（传说进出）与「这片世界自己前后对得上吗」（四本账）。
    { id: 'net', icon: '🛰', label: '联网' },
    { id: 'events', icon: '⚡', label: '事件' },
    { id: 'director', icon: '🎬', label: '导演' },
    { id: 'settings', icon: '⚙️', label: '设置' },
    { id: 'connect', icon: '🔌', label: '连接' },
    { id: 'assistant', icon: '💬', label: '助手' },
    { id: 'tools', icon: '🧰', label: '工具' },
    { id: 'logs', icon: '📋', label: '日志' }
  ];

  // == v2.109.0（计划一 #15）：面板状态持久化走设置总线 ==
  //   为什么必须有它（三条实测理由，不是偏好）：
  //     ① 面板把「上一次停在哪一页 / 日志是否只看错误」这类**交互偏好**放在模块级闭包变量里——
  //        页面一刷新、宿主一重载，用户的视图状态就回到出厂值；而这类状态**没有任何生命周期
  //        理由**不持久化（它不是运行时引用，是用户选择）。
  //     ② 但持久化**不能**各写各的 localStorage：本仓 v2.5.0 起，设置键的单一真源是
  //        `WA.__settingsRegs`（各模块自持登记），写路径必须走 `settingsBus.saveOrThrow`——
  //        那条路径内含写后读回校验、失败分桶、子键漂移计量、结构指纹与迁移引擎。绕开它直写
  //        `localStorage.setItem` 会让「一次面板操作」在诊断里变成「没有发生过」。
  //     ③ 它此前确实是「外部可见的可变状态」，只是**没有任何登记、计量与出口**。
  //   刻意**不**持久化的：panelEl / orbEl（DOM 引用）、lastPerfSnap（时效性槽，跨会话比对无
  //   意义）、__rerenderTimer（运行时定时器）、__cnBuilt / __memRefKey（缓存/展开键）。
  const __PANEL_STATE_KEY = 'worldaxis_ui_panel_state_v1';
  const __panelStateReg = {
    key: __PANEL_STATE_KEY,
    def: { page: 'overview', logErrOnly: false },
    module: 'ui',
    // 枚举白名单：页面 id 是**闭合集合**（PAGES）。不声明的话，旧版本删掉某页后，磁盘里会
    //   留着一个永远切不过去的「当前页」，表现为「面板打开是空白页」且**零报错**（silent）。
    enums: { page: PAGES.map(function (p) { return p.id; }) }
  };
  // 幂等登记（实测：tests/run.js 有 8 处直接求值本文件而**不清**登记表，无条件 concat 会让
  //   同一个键在同一张表里出现 8 次——而「重复登记」在 settingsBus.selfCheck() 里是 error 级
  //   阻断项，那会是一盏自造的红灯。filter+concat 仍是无条件重建，与其余模块同口径）。
  WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) {
    return !r || r.key !== __PANEL_STATE_KEY;
  }).concat([__panelStateReg]);
  /** 读侧快照（settingsBus 缺席时回落 def —— 与各引擎同口径）。 */
  function __panelState() {
    try {
      if (WA.settingsBus && typeof WA.settingsBus.read === 'function') return WA.settingsBus.read(__panelStateReg);
    } catch (e) {}
    return { page: 'overview', logErrOnly: false };
  }
  /** 页 id 白名单校验（**读侧**）：`enums` 声明管的是**写**路径不落非法值；本函数管的是
   *  **读**路径不因历史非法值炸渲染 —— `RENDERERS[非法 id]` 是 undefined，调用它必抛。 */
  function __pageOr(fb) {
    const p = (__panelState() || {}).page;
    for (let i = 0; i < PAGES.length; i++) if (PAGES[i].id === p) return p;
    return fb;
  }
  /** 面板状态落盘（**唯一写路径**：走 settingsBus.saveOrThrow）。
   *  失败必须留下痕迹：静默失败会让用户看到「关了面板再打开又是老样子」，而日志里没有
   *  任何解释——本仓对「写失败被当成成功」已有一次裁决（v2.6.0 calendar 的 ✓ 已保存）。 */
  function __persistPanel() {
    try {
      if (!WA.settingsBus || typeof WA.settingsBus.saveOrThrow !== 'function') {
        // 首版此处静默返回 —— 而本文件顶上刚写过「失败必须留下痕迹」。补齐。
        // 另：首版给这一路与「无返回」那一路共用一个自造的原因串，被拒收码扫描面捕获；
        //   两路失败各有真实原因，不需要自造的码来统一（见 v2.109.0 沿革）。
        if (WA.log) WA.log('warn', 'ui.panel: 面板状态未落盘——设置总线未装载（本次会话内仍生效）', null);
        return { ok: false };
      }
      const r = WA.settingsBus.saveOrThrow(__panelStateReg, { page: currentPage, logErrOnly: __logErrOnly });
      if (r && r.ok === false && WA.log) WA.log('warn', 'ui.panel: 面板状态未落盘（' + (r.reason || '?') + '，本次会话内仍生效）', null);
      return r || { ok: false };
    } catch (e) {
      if (WA.log) WA.log('warn', 'ui.panel: 面板状态写盘异常', e);
      return { ok: false, reason: String((e && e.message) || e) };
    }
  }
  let currentPage = __pageOr('overview');
  let panelEl = null, orbEl = null;
  /** v2.109.0（#7）：上一次「基准面」按下时的性能快照。存在的意义就是**下次能比对**——
   *   没有它，`importSnapshot` 只能与现场自比（恒等），那是看起来有值、其实没有意义的读数。 */
  let lastPerfSnap = null;

  function h(html) { const d = mainDoc.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  // v2.111.0（计划二 #69）：转义走单一真源 core/sanitize.js；本处是兜底实现。
  //   修掉两个真缺陷：① 原映射表把双引号映射成双引号自己（恒等），故属性上下文里等于不转义；
  //   ② 另有 2 处调用了全仓不存在的 escapeHtml 函数（一碰就 ReferenceError）。
  function esc(s) {
    // 刻意**逐字写全** `WA.sanitize.html`（而不是先存进局部变量再调）：
    //   死子面门禁的引用正则只看 `WA.<ns>.<mem>` 这种字面形态，存进局部变量后调用点
    //   在静态面上就是「产品代码零引用」—— 于是账本会记下一条与事实相反的证据。
    //   「证据与判据同宽」是本仓的硬规矩：真在用的东西不许看起来像死的。
    if (WA && WA.sanitize && typeof WA.sanitize.html === 'function') return WA.sanitize.html(s);
    var A = String.fromCharCode(38), LT = String.fromCharCode(60), GT = String.fromCharCode(62), DQ = String.fromCharCode(34), AP = String.fromCharCode(39);
    return String(s == null ? '' : s).replace(new RegExp('[' + A + LT + GT + DQ + AP + ']', 'g'), function (c) {
      if (c === LT) return A + 'lt;';
      if (c === GT) return A + 'gt;';
      if (c === DQ) return A + 'quot;';
      if (c === AP) return A + '#39;';
      return A + 'amp;';
    });
  }

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
    const bad = st.failed > 0 ? '<span class="wa-bad">｜参数非法 ' + st.failed + ' 次（' + esc(JSON.stringify(st.failedBy || {})) + '）</span>' : '';
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
    const bad = st.failed > 0 ? '<span class="wa-bad">｜参数非法 ' + st.failed + ' 次（' + esc(JSON.stringify(st.failedBy || {})) + '）</span>' : '';
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
    // ① 世界链在不在走（causal.stateView —— 纯读存档，不推进世界）
    try {
      const cv = (WA.causal && typeof WA.causal.stateView === 'function') ? WA.causal.stateView() : null;
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
    } catch (e) { out.push('<div class="wa-kv">世界链：<span class="wa-dim">读取失败（' + esc(e && e.message) + '）</span></div>'); }
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
    } catch (e) { out.push('<div class="wa-kv">本轮注入：<span class="wa-dim">读取失败（' + esc(e && e.message) + '）</span></div>'); }
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
        if (blocked > 0) out.push('<div class="wa-kv wa-bad">删除出口已拦下 ' + esc(String(blocked)) + ' 次'
          + '<span class="wa-dim">（被拦下的删除一个字节都没碰存储）</span></div>');
      }
    } catch (e) { out.push('<div class="wa-kv">删除闸门：<span class="wa-dim">读取失败（' + esc(e && e.message) + '）</span></div>'); }
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
      out.push('<div class="wa-dim">④ 性能趋势：读取抛错（' + esc(String(e && e.message || e)) + '）</div>');
    }
    return '<div class="wa-card"><div class="wa-card-h">引擎心跳（四源聚合 · 只读）</div>'
      + out.join('')
      + '<div class="wa-hint">三行分别答：<b>世界链在不在走</b>（因果链条数与状态）、'
      + '<b>本轮注入在不在转</b>（耗时与局部重算）、<b>基准够不够判</b>（四档结构是否在场）。<br>'
      + '全部只读、零动作：真正的操作入口在「因果工作台」「档位面」「增量面」与「诊断」页。<br>'
      + '「未上报」与「0ms」是两件事 —— 宿主 API 耗时无上报时照实写未上报，不拿 0ms 冒充「API 很快」。</div></div>';
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
      <div data-omniscient>${heartbeatBlock()}${evictBlock()}${randBlock()}${clockBlock()}${bridgeBlock()}${lonshaBlock()}</div>
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
       ${(() => {
         // v2.96.0（X3）：传播链**只读**概览。放在事实列表正下方——因为「起一条链」的入参
         //   就是这上面列出的 fact key，两者必须看得到彼此（否则用户得去人物页猜 key）。
         //   这里不引入任何控件（纯文本）：控件一律登记在人物页那一组，避免同一出口两处渲染。
         const cfg = (WA.rumor && WA.rumor.getSettings) ? WA.rumor.getSettings() : null;
         if (!cfg) return '<div class="wa-sec">传播与辟谣</div><div class="wa-dim">模块未装载</div>';
         if (!cfg.enabled) return '<div class="wa-sec">传播与辟谣</div><div class="wa-dim">关闭（未记录、未注入；在人物页打开）</div>';
         const fv = (typeof WA.rumor.fullView === 'function') ? WA.rumor.fullView() : null;
         const rows = (fv && fv.ok && Array.isArray(fv.chains)) ? fv.chains : [];
         if (!rows.length) return '<div class="wa-sec">传播与辟谣</div><div class="wa-dim">尚无传播链（起链后此处显示每条链停在哪一层）</div>';
         return '<div class="wa-sec">传播与辟谣（' + rows.length + '）</div>'
           + '<div class="wa-list">' + rows.slice(-8).map(function (c) {
               return '<div class="wa-item"><b>' + esc(c.factKey) + '</b> <span class="wa-dim">@' + esc(c.layer)
                 + ' · ' + esc(String(c.hopCount)) + ' 跳 · 隐瞒 ' + esc(String(c.suppressed))
                 + (c.intact ? '' : ' · <b>已被改写</b>') + '</span></div>';
             }).join('') + '</div>';
       })()}
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
      })()}
      ${(() => {
         // v2.151.0（RX3）：远方世界脉搏（只读概览）。控件一律登记在「会话」页，本块**不引入任何控件**
         //   （纯文本），避免同一出口两处渲染（同 v2.96.0 传播链只读块挂在世界页的惯例）。
         if (!WA.farfield || typeof WA.farfield.stat !== 'function') return '<div class="wa-sec">远方世界脉搏</div><div class="wa-dim">模块未装载</div>';
         const fcfg = (typeof WA.farfield.getSettings === 'function') ? WA.farfield.getSettings() : null;
         if (!fcfg) return '<div class="wa-sec">远方世界脉搏</div><div class="wa-dim">模块未装载</div>';
         if (!fcfg.enabled) return '<div class="wa-sec">远方世界脉搏</div><div class="wa-dim">关闭（远场不推进，也不注入；在会话页打开）</div>';
         const st = WA.farfield.stat();
         const pend = (typeof WA.farfield.pending === 'function') ? WA.farfield.pending() : null;
         const prows = (pend && Array.isArray(pend.rows)) ? pend.rows : [];
         return '<div class="wa-sec">远方世界脉搏（近场 ' + st.nearCount + ' 处 / 远场 ' + st.farCount + ' 处）</div>'
           + '<div class="wa-dim">近场由眼前的世界自行呈现，本块只报远场。划分线以 region.places() 的距离为单一真源（本模块不另存一份地区表）。</div>'
           + '<div class="wa-dim">远方大事记 ' + st.pulses + ' · 在途传闻 ' + st.pendingInFlight + ' · 已传到近场 ' + st.heard + ' · 已失真 ' + st.distorted + '</div>'
           + (prows.length ? '<div class="wa-list">' + prows.slice(-8).map(function (m) {
               return '<div class="wa-item"><b>' + esc(m.place) + '</b> <span class="wa-dim">' + esc(String(m.trend))
                 + ' · 距离延迟 ' + esc(String(m.delayDays)) + ' 天</span></div>';
             }).join('') + '</div>'
             : '<div class="wa-dim">无在途传闻（远场还静着，或已全部落地）</div>');
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
      // v2.91.0 O4：跨模块身份引用的悬空——**只报不删**。
      //   关系 / 量值 / 承诺三类行里的 target 是名字引用：被改名、被解除绑定、或从来
      //   没登记过时，行仍原样留着，而此前任何出口都看不见这一层。
      //   这里只给「几条 + 前几条」：给太多等于把这条读数淹掉，逐条明细走诊断页。
      const dang = (typeof WA.registry.danglingRefs === 'function') ? WA.registry.danglingRefs() : null;
      const dangRow = (dang && dang.rows)
        ? '<div class="wa-item wa-dim"><b>悬空引用 ' + dang.rows + ' 条</b>（指向未登记的名字：'
          + dang.items.slice(0, 4).map(function (x) { return esc(x.from) + '→' + esc(x.target) + '（' + esc(x.kind) + '）'; }).join('；')
          + (dang.rows > 4 ? ' 等' : '') + ' · 只报不删，确认后再改）</div>'
        : '';
      if (!ks.length) return head + dangRow;
      return head + dangRow + ks.map(function (k) {
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
      <div class="wa-row"><button class="wa-btn" id="wa-org-grant">入库</button><button class="wa-btn" id="wa-org-transfer">转移</button><button class="wa-btn" id="wa-org-check">检查余额</button><button class="wa-btn" id="wa-org-ledger">资源账本</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-org-export" title="导出一卷流水（纯读：不挤出、不清空、不改计数）——跨会话全量对账靠它">导出流水</button><button class="wa-btn" id="wa-org-reconcile" title="把上一次导出的流水卷与本侧当前存量比对（带外 = 本侧环形已挤出、只有外来卷才核得到）">带外对账</button><button class="wa-btn" id="wa-org-climate" title="读数：当前经济气候（繁荣/平稳/衰退/动荡）与最近信号；只读 evolution.economy，不回落成「平稳」">经济风</button></div>
      <div class="wa-row"><input id="wa-org-person" class="wa-input" placeholder="成员姓名"/><input id="wa-org-role" class="wa-input" placeholder="职阶 novice/member/steward/chief 或 帮闲/管事/主事/当家"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-org-assign" title="编入名册或改任（同一人重复编入 = 改职，不叠加——「本来就是他」与「刚收进来」必须可区分）">编入</button><button class="wa-btn" id="wa-org-credit" title="记功：只记在册者，单次上限 99；够门槛只报 ready，不自动晋升（晋升是显式决策，不是记账的副作用）">记功</button><button class="wa-btn" id="wa-org-promote" title="晋升：贡献够门槛才升一阶；不够就照实报差多少——不四舍五入、不「看表现」">晋升</button><button class="wa-btn" id="wa-org-roster" title="名册：逐人职阶 / 贡献 / 欠薪 / 下一阶门槛 / 本期应付 + 当前经济风（两档同账不同词）">名册</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-org-pay" title="发薪：逐人把本期应付从势力转给本人（走 transfer——同一支笔，自动进流水与带外对账）；发不出就记欠薪，不静默减半">发薪</button><button class="wa-btn" id="wa-org-settle" title="补发欠薪：只补得起的量，余额照实留着（不把「还欠着」抹成「清了」）">补发欠薪</button><button class="wa-btn" id="wa-org-penalize" title="罚没：本人 → 势力一次 transfer 走完（不是「先 grant 再扣」两步——两步之间没有原子性，中途失败会凭空多出资源）">罚没</button></div>
      <div class="wa-row"><input id="wa-org-project" class="wa-input" placeholder="项目名（如 修堤）"/><input id="wa-org-needs" class="wa-input" placeholder="所需物资：粮100、布20"/><input id="wa-org-due" class="wa-input" placeholder="期限(可空)"/><input id="wa-org-why" class="wa-input" placeholder="欠账原因（登记欠账必填）"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-org-proj-open" title="立项目：目标 + 所需物资逐项刻数 + 发起人；同名未结项的项目拒收（并存两个同名项目，账面就答不出交付的货进了哪一个）">立项目</button><button class="wa-btn" id="wa-org-proj-deliver" title="交付：本人 → 势力一次 transfer（同一支笔，自动进流水与带外对账），并记进该项目的覆盖；只收清单上有的东西——把无关物资倒进来算进度，等于进度可伪造">交付物资</button><button class="wa-btn" id="wa-org-proj-view" title="项目读数：逐项目状态 / 需求 / 已覆盖 / 缺口 + 当前档位（精确档给刻数、叙事档给词、不可读即 unknown——不给词）">项目</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-org-proj-close" title="结项：全部覆盖才算完成；缺多少就报多少（shortfall），不把「差一点」写成「完成」">结项</button><button class="wa-btn" id="wa-org-owe" title="登记债务：谁欠谁、欠什么、为什么。没有原因字段的欠账，日后没人答得出它是怎么来的">登记欠账</button><button class="wa-btn" id="wa-org-debt-settle" title="清偿欠账：只还得起的量（债可分批），余额照实留着；走 transfer（人 → 势力），与罚没同一支笔">清偿欠账</button><button class="wa-btn" id="wa-org-debts" title="债权债务双向读数：逐条带对象与原因，不汇总成净额（净额会把「甲欠我 10 粮」与我欠甲 10 布抵成 0）">债务</button></div>
      <div id="wa-org-out" class="wa-out"></div>
      <div class="wa-sec">机会与题材配方（B6）</div>
      <div class="wa-row"><input id="wa-rec-name" class="wa-input" placeholder="配方名 urban/mystery/business/survival（留空看当前档）"/><button class="wa-btn" id="wa-rec-view" title="配方预览：装配面 + 规则冲突 + 基础事实核对结论。纯计算、不落设置——预览不改任何东西（wrote 恒为 null）">配方预览</button><button class="wa-btn" id="wa-rec-seed" title="取一条场景种子（取用制）：不调就一个字节都不进上下文；场景只含起手情形，不含人名与世界设定">取场景</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-opp-run" title="扫描机会：把世界状态的变化收敛成「此刻可参与的窗口」（承诺逾期/项目缺口/目标互斥/情报未核实/欠账未清/因果后果到期）。到窗口末尾的在途行转「作废」，已接/已拒永不重开">扫描机会</button><button class="wa-btn" id="wa-opp-view" title="机会读数：在途窗口逐条带「涉及谁 / 窗口多久」；涉及者未记录就印未记录，不猜一个人名填上">机会读数</button></div>
      <div id="wa-rec-out" class="wa-out"></div>
      <div class="wa-sec">因果与情报</div>
      <label class="wa-row"><input id="wa-intel-enabled" type="checkbox" ${WA.intel && WA.intel.getSettings().enabled ? 'checked' : ''}/> 启用因果与情报</label>
      <div class="wa-row"><input id="wa-intel-cause" class="wa-input" placeholder="已有前因"/><input id="wa-intel-effect" class="wa-input" placeholder="结果"/></div>
      <div class="wa-row"><input id="wa-intel-person" class="wa-input" placeholder="知情人物"/><input id="wa-intel-claim" class="wa-input" placeholder="情报"/><input id="wa-intel-source" class="wa-input" placeholder="来源"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-intel-link">加因果</button><button class="wa-btn" id="wa-intel-add">加情报</button><button class="wa-btn" id="wa-intel-project" title="认知投影（只读）：这个人此刻对这一条「知道多少」。走 intel.project —— 真相只读，谁有资格听由取证档决定；无资格时**只报条数、不报内容**（「他手上有东西但看不到真相」与「他什么都没听说」是两种处境：前者会被一轮追问逼出破绽，后者不会）。查不出来与「知道得对」不许同形">查认知投影</button><button class="wa-btn" id="wa-intel-correct" title="更正：辟谣只对收到过该说法的人生效。此人从没听说过这条就报 nothing-to-correct —— 不做「更正」旁路把一条新说法塞进空脑子（那与 addIntel 是不同的口子）。旧说法标 retracted 并留痕，不删行">更正认知</button></div>
      <div id="wa-intel-out" class="wa-out"></div>
      <div class="wa-sec">防全知闸门（这个人此刻该不该知道这件事）</div>
      <label class="wa-row"><input id="wa-noe-enabled" type="checkbox" ${WA.noesis && WA.noesis.getSettings().enabled ? 'checked' : ''}/> 启用防全知闸门</label>
      <div class="wa-row"><input id="wa-noe-person" class="wa-input" placeholder="人物"/><input id="wa-noe-fact" class="wa-input" placeholder="事实 / 秘密名"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-noe-knows" title="裁决：这个人此刻该不该知道这件事。四个归因码分开报——没登记过（not-registered）/登记了但此人不知（not-holder）/人不在场（out-of-range）/时辰未到（premature），合成一个「不知」就答不出是边界没划、人不在场、还是时辰未到">裁决知情</button><button class="wa-btn" id="wa-noe-scan" title="事后泄露扫描：把「人物=秘密名」逐条核，检出有谁说出了它不该知道的事。只留痕不删文——删文是叙事决定，不是引擎决定">泄露扫描</button><button class="wa-btn" id="wa-noe-boundary" title="只读：防全知引擎现场（几个知情面在把门 / 裁决数 / 穿帮留痕数）。穿帮数与扫描数分开报——真穿帮多要改边界，扫得勤只是用法不同">边界读数</button><button class="wa-btn" id="wa-noe-gate" title="生成前闸门：一组人物 × 一组事实，逐条答「哪些人不该知道哪些事」。只报不改正文——自动改写会把作者的笔抢走（与 E11「只报不改」同一条纪律）">生成前闸门</button><button class="wa-btn" id="wa-noe-perceive" title="感知半径：这个人此刻能否感知那个地点发生的事。三态封闭（在场 / 可达 / 不可达），不可达如实报 out-of-range——不回落成可达">感知半径</button><button class="wa-btn" id="wa-noe-duty" title="在岗闸门：此人此刻在不在这个岗上（在职 ≠ 在岗）。三态封闭——任职面缺席报「无话可说」/ 在职但被日程占住报 off-duty（等排班）/ 压根不在职报 not-in-office（走任职流程）。两码不合并，也不回落成「在岗」；只答在不在岗，不答知不知道（人下班了知道的事不会忘）">在岗闸门</button><button class="wa-btn" id="wa-noe-fidelity" title="记忆失真核查：此人手里记的是不是原版（记着 ≠ 记对）。三态封闭——传播面缺席/此人不在链上报「无话可说」/ 接到的是原版报 faithful / 接到的是被改写过的版本报 distorted 并带出改写前后的值。只报不改：更正记录是叙事决定，不是引擎决定。与「知情裁决」严格分开——人记岔了不等于他不知道">记忆失真核查</button></div>
      <div id="wa-noe-out" class="wa-out"></div>
      <div class="wa-sec">生理与照护层（带着什么状况、到哪一段、限制什么）</div>
      <label class="wa-row"><input id="wa-lfn-enabled" type="checkbox" ${WA.lifeline && WA.lifeline.getSettings().enabled ? 'checked' : ''}/> 启用生理与照护层</label>
      <div class="wa-row"><input id="wa-lfn-person" class="wa-input" placeholder="人物"/><input id="wa-lfn-cond" class="wa-input" placeholder="状况名（不是症状描述）"/></div>
      <div class="wa-row"><input id="wa-lfn-kind" class="wa-input" placeholder="类别 acute/chronic/injury/mental/neuro/trauma/disability/reproductive"/><input id="wa-lfn-limits" class="wa-input" placeholder="限制（多个用「、」：energy/sleep/cognition/sensory/mobility/social/work/medication）"/></div>
      <div class="wa-row"><input id="wa-lfn-care" class="wa-input" placeholder="照护已落账步骤（多个用「、」：triage/exam/diagnosis/treatment/monitoring/rehab/access）"/><button class="wa-btn" id="wa-lfn-register" title="登记一个病况。**这是本模块唯一的创建口**——病况只能被登记，不能被推断（零「由症状推病名」）。同名重登记必须显式 replace，不静默覆盖">登记状况</button></div>
      <div class="wa-row"><input id="wa-lfn-course" class="wa-input" placeholder="推进到哪一段 onset/progress/flare/remission/recovery/stable/longterm"/><button class="wa-btn" id="wa-lfn-advance" title="推进程段：只许沿七格**前进一格或原地**。跨格与回退一律拒收并带 from/to——「昨天病危、今天痊愈」在慢性病与创伤上是最刺眼的一种失真">推进程段</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-lfn-capacity" title="容量面（只读）：这个人此刻哪些活动受限、限到哪一档。known:false（查不到）与「无限制」严格分开——查不到不许冒充「他很健康」">容量读数</button><button class="wa-btn" id="wa-lfn-gap" title="照护缺口（只读）：按七步流程报「哪几步还没有落账」。它只答流程差，不写医疗结果——结果归别处真源">照护缺口</button><button class="wa-btn" id="wa-lfn-view" title="只读明细：这个人此刻带着的全部状况与程段历史。只报程段与限制，不列症状细节">看明细</button></div>
      <div id="wa-lfn-out" class="wa-out"></div>
      <div class="wa-sec">视角锁（这一笔该不该由这个视角交代）</div>
      <label class="wa-row"><input id="wa-per-enabled" type="checkbox" ${WA.perspective && WA.perspective.getSettings().enabled ? 'checked' : ''}/> 启用视角锁</label>
      <div class="wa-row"><input id="wa-per-scene" class="wa-input" placeholder="场景名（不填 = 最近登记的那一幕）"/><input id="wa-per-lens" class="wa-input" placeholder="视角五档 omniscient/first/limited/ensemble/camera"/></div>
      <div class="wa-row"><input id="wa-per-persons" class="wa-input" placeholder="视角人物（多个用「、」；camera 可空 —— 无主摄像机不是视角）"/><button class="wa-btn" id="wa-per-assign" title="登记一处场景视角。**这是本模块唯一的写口** —— 视角只能被登记，不能被推断。同名重登记必须显式 replace（不静默覆盖：覆盖之后没人答得出原来是哪一档）。除 camera 外，视角必须有至少一个视角人物">登记视角</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-per-current" title="当前视角（只读）：给了场景取该场景，没给则取最近登记的那一幕。一行都没有报 no-scene — **不回落成全知**（「没登记」与「随便写」是两件事）">当前视角</button><button class="wa-btn" id="wa-per-boundary" title="只读：视角锁引擎现场（几处已登记 / 四类拒绝各多少次）。四类拒绝分开报 —— 合成一个「不许写」之后，作者就再也知道该改词表、先登记、补共视角，还是换渠道">边界读数</button></div>
      <div class="wa-row"><input id="wa-per-who" class="wa-input" placeholder="这一笔写谁"/><input id="wa-per-channel" class="wa-input" placeholder="渠道 narrator/interior/dialogue/document/flashback"/><input id="wa-per-access" class="wa-input" placeholder="取证 witnessed/perceived/inferred/exterior"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-per-allows" title="单笔裁决：这一笔能不能由当前视角交代。内心是唯一被闸死的渠道 —— 除全知外，内心只属于视角人物本人（此条任何档位下都不放宽）。不查知情面：那是防全知闸门的活，两个真源不可合并">单笔裁决</button><button class="wa-btn" id="wa-per-leak" title="事后扫描：在已经写进正文的笔里检出越界项（只核 written:true 的）。只留痕不删文 —— 删文是叙事决定，不是引擎决定">越界扫描</button><button class="wa-btn" id="wa-per-block" title="注入块预览：只报纪律与当前模式，不列视角人物名 —— 视角行里可能有作者预登记、尚未登场的角色，列名就是剧透">注入块预览</button></div>
      <div id="wa-per-out" class="wa-out"></div>
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
      <div class="wa-row">
  <button class="wa-btn" id="wa-causal-ripple" title="后果涟漪网（只读推导）：把单层链推成二阶网——已结算后果作为新原因被后续链引用即记一条级联边。无网如实报无涟漪，不编造。">后果涟漪网</button>
  <button class="wa-btn" id="wa-causal-endings" title="多结局分支预演（只读预演）：从当前状态把每条在途链可推演出的终态集合列全（settled/cancelled/expired），并标出有因无果的 blocked。不预测哪条会发生。">多结局预演</button>
<input id="wa-causal-trace-key" class="wa-in" placeholder="要追溯的事实键（如 causal:链id）" maxlength="120" />
<button class="wa-btn" id="wa-causal-trace" title="因果追溯图谱（只读推导）：以任一事实为轴心双向追溯——它由哪条链产出、被哪些链与回声引用、级联到哪，并标出因果跨了哪几个模块。无图谱如实报，不编造。">因果追溯图谱</button>
</div>
<div id="wa-causal-out" class="wa-out"></div>
      <div class="wa-sec">人物身份（持久 ID ↔ 存档键）</div>
      <div class="wa-row"><input id="wa-id-name" class="wa-input" placeholder="人物姓名"/><button class="wa-btn" id="wa-id-lookup">查身份</button><button class="wa-btn" id="wa-id-bindall" title="为当前聊天里已经注册、但还没有持久编号的人物补上编号（不改动任何状态）">补全已注册</button><button class="wa-btn" id="wa-id-clear" title="只解除身份绑定，不删除该人物的任何状态">解除绑定</button></div>
      <div class="wa-row"><input id="wa-id-aliasname" class="wa-input" placeholder="旧名（改名之前的名字）"/><button class="wa-btn" id="wa-id-bindalias" title="登记一条改名台账：旧名永久可解析（只增不删），于是「改过名」不再等于「断过链」。规范名须已在册（给不存在的人登记历史名 = 凭空造一个身份）；一个旧名只有一个主人；链可以深但必须有边界（超过 8 跳当场拒收）">登记旧名</button><button class="wa-btn" id="wa-id-aliasof" title="查改名：对历史名也作答——它现在是谁、经过几跳、路径是什么。查不到就说查不到（unknown-name），不替它编一个规范名">查改名</button><button class="wa-btn" id="wa-id-aliasstat" title="改名台账：几对旧名 / 涉及几人 / 最深几跳（上限 8）">改名台账</button></div>
      <div id="wa-id-out" class="wa-out"></div>
      <div class="wa-list">${idRows}</div>
      <div class="wa-sec">世界织体（地点、道路、共同日程）</div>
      <div class="wa-list">${settleRows}</div>
      <label class="wa-row"><input id="wa-world-enabled" type="checkbox" ${WA.world && WA.world.getSettings().enabled ? 'checked' : ''}/> 启用世界织体</label>
      <div class="wa-row"><input id="wa-world-place" class="wa-input" placeholder="地点名"/><button class="wa-btn" id="wa-world-addplace" title="登记一个地点：没登记的地方不可达（不猜「大概很近」）">登记地点</button><button class="wa-btn" id="wa-world-reach">查可到</button></div>
      <div class="wa-row"><input id="wa-world-rd-a" class="wa-input" placeholder="从"/><input id="wa-world-rd-b" class="wa-input" placeholder="到"/><input id="wa-world-rd-min" class="wa-input" placeholder="分钟"/><button class="wa-btn" id="wa-world-addroad" title="登记一条道路：没登记的路走不通">登记道路</button></div>
      <div class="wa-row"><input id="wa-world-ev-title" class="wa-input" placeholder="共同日程名"/><input id="wa-world-ev-place" class="wa-input" placeholder="地点"/><button class="wa-btn" id="wa-world-addevent">登记日程</button><button class="wa-btn" id="wa-world-tick">推进日程</button><button class="wa-btn" id="wa-world-who" title="到场者只认日程证据——没依据的人不会出现在名单里">查到会人</button></div>
      <div class="wa-row"><input id="wa-world-mv-who" class="wa-input" placeholder="人物"/><input id="wa-world-mv-from" class="wa-input" placeholder="从"/><input id="wa-world-mv-to" class="wa-input" placeholder="到"/><button class="wa-btn" id="wa-world-move" title="先问路通不通，再问此人这一刻在不在别处">移动</button><button class="wa-btn" id="wa-world-canbe">能否在场</button></div>
      <div class="wa-row"><input id="wa-world-tr-ch" class="wa-input" placeholder="person / goods / message"/><button class="wa-btn" id="wa-world-transit" title="按通道判通行：人可到 / 物可到 / 消息可到分开作答；恶劣天气封锁路线（人/物不可，消息可）">判通行</button></div>
      <div class="wa-sec">场所用途与时间窗口</div>
      <div class="wa-dim">用途是**封闭集合**（business/duty/class/visit/meeting/custom）——自由文本会让「哪个用途的窗口管这一件事」永远没有答案。这里登记的是「某地某用途的开放时段」，只影响该地点的判定；没登记用途的地点仍按地点自身开闭（空白地点保持抽象）。</div>
      <div class="wa-row"><input id="wa-world-use-place" class="wa-input" placeholder="地点（留空取左侧登记地点）"/><input id="wa-world-use-kind" class="wa-input" placeholder="用途 business/duty/class/visit/meeting/custom"/><input id="wa-world-use-open" class="wa-input" placeholder="开（毫秒时刻或日期）"/><input id="wa-world-use-close" class="wa-input" placeholder="关"/></div>
      <div class="wa-row"><input id="wa-world-use-note" class="wa-input" placeholder="备注（可空，只在填了才会覆盖旧备注）"/><button class="wa-btn" id="wa-world-use-add" title="登记或更新一条用途窗口：同一地点同一用途重登记即更新；窗口容不下要办的事报 window-too-short 并回报差多少">登记用途窗口</button><button class="wa-btn" id="wa-world-use-list" title="只读：这个地点已登记哪些用途窗口。地点没登记一律报 unknown-place——不返回空名单冒充「没有用途」">看用途窗口</button><button class="wa-btn" id="wa-world-use-win" title="只读：某地某用途此刻生效的窗口。found:false 表示没登记该用途 ⇒ 回落到地点自身开闭">查某用途窗口</button></div>
      <div id="wa-world-use-out" class="wa-out"></div>
      <div class="wa-sec">人物行动（目标 → 候选行动 → 准入 → 执行 → 完成或失败 → 后果）</div>
      <label class="wa-row"><input id="wa-act-enabled" type="checkbox" ${WA.act && WA.act.getSettings().enabled ? 'checked' : ''}/> 启用人物行动</label>
      <div class="wa-dim">目标表达「想实现什么」（来自人物生活区的目标）；行动表达「怎么做」。<b>没有内置确认器的种类（tell/work）一律落成可见失败</b>——不凭一句话创造「已完成」。</div>
      <div class="wa-row"><input id="wa-act-person" class="wa-input" placeholder="人物（留空取人物生活区的人）"/><input id="wa-act-kind" class="wa-input" placeholder="wait/rest/move/meet/tell/work/deliver"/><input id="wa-act-text" class="wa-input" placeholder="目标来源或行动说明"/></div>
      <div class="wa-row"><input id="wa-act-with" class="wa-input" placeholder="对象（meet 的对方 / deliver 的收方）"/><input id="wa-act-item" class="wa-input" placeholder="物（deliver）"/><input id="wa-act-amount" class="wa-input wa-num" type="number" min="0" placeholder="数量"/><input id="wa-act-place" class="wa-input" placeholder="地点（可空）"/></div>
      <div class="wa-row"><input id="wa-act-from" class="wa-input" placeholder="从（move）"/><input id="wa-act-to" class="wa-input" placeholder="到（move）"/><input id="wa-act-use" class="wa-input" placeholder="用途（可空）"/><input id="wa-act-dur" class="wa-input wa-num" type="number" min="0" placeholder="时长毫秒（可空取默认）"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-act-add" title="只登记候选行动，不开工——准入是 admit 的事；目标必须是此刻仍 active 的那个（目标被撤销后挂在它下面的行动不得照常开工）">登记行动</button><button class="wa-btn" id="wa-act-admit" title="准入：问「这一刻这个人能不能开始做这件事」。判据顺序从「这件事本身」到「世界条件」，全部只读、拒收零变化">准入</button></div>
      <div class="wa-row"><input id="wa-act-id" class="wa-input" placeholder="行动 id"/><button class="wa-btn" id="wa-act-advance" title="结算所有到点的活动作（与工作流 after 链每轮自动推进同一入口）；超额者进 deferred 显式留痕，不静默跳过">结算到期</button><button class="wa-btn" id="wa-act-abort" title="中止：已消耗部分与未执行部分分别落账（spent/left 各记一格）；在途者交世界侧标成 halted，位置未知">中止</button><button class="wa-btn" id="wa-act-replan" title="受阻后改计划：旧行变 replanned 并留痕、新行指回旧行。在途者不得用本入口改道——必须先中止，否则会把真实走过的路抹成没发生">改计划</button><button class="wa-btn" id="wa-act-view" title="只读：按状态分列，并如实带出「哪些种类没有确认器">看台账</button><button class="wa-btn" id="wa-act-verdict" title="合法不行动：判这一笔的结果属于哪一档（action/refuse/delay/status-quo）。四档不可合并——「他没动」不等于「这一轮没算」。只判定，不写世界">判结果档</button></div>
       <div id="wa-act-out" class="wa-out"></div>
       <div class="wa-sec">人物计划（目标 → 有限步数 → 受挫改选）</div>
       <label class="wa-row"><input id="wa-plan-enabled" type="checkbox" ${WA.plan && WA.plan.getSettings().enabled ? 'checked' : ''}/> 启用人物计划</label>
       <div class="wa-dim">计划只<b>展开一个已存在的 active 目标</b>（不建人、不建目标）。步骤用 〔序号(kind)文本〕 逐行写，可选 〔需要:资源×数量〕、〔前置:序号〕、〔地点:x〕、〔受阻改走:…〕。<b>受阻不等于放弃</b>——改选必须显式提交新步骤。</div>
       <div class="wa-row"><input id="wa-plan-person" class="wa-input" placeholder="人物"/><input id="wa-plan-goal" class="wa-input" placeholder="目标 id（留空取该人第一个 active 目标）"/></div>
       <div class="wa-row"><textarea id="wa-plan-steps" class="wa-input" rows="3" placeholder="0(work)去码头搬货&#10;1(work)攒够路费 前置:0 需要:银元×3&#10;2(move)搭船去乙地 前置:1 受阻改走:改走陆路"></textarea></div>
       <div class="wa-row"><button class="wa-btn" id="wa-plan-expand" title="展开为有限步数的计划：步数超上限一律拒收（too-many-steps），不静默截断；前置必须指向更小的序号（防环）">展开计划</button><button class="wa-btn" id="wa-plan-current" title="只读：当前该做哪一步（第一个前置都已完成的 pending 步）；没有计划报 no-plan，不造一条空计划">看当前步</button><button class="wa-btn" id="wa-plan-advance" title="交出当前步并标 running——只登记「他打算做这一步」，不执行（真正开工走人物行动的准入）">登记开工</button></div>
       <div class="wa-row"><button class="wa-btn" id="wa-plan-done" title="这一步真的完成了 ⇒ 前进；全部完成 ⇒ 计划终态 done">结算完成</button><button class="wa-btn" id="wa-plan-blocked" title="这条路走不通 ⇒ 进受阻（计一次尝试，超上限报 tries-exhausted 然后停下等人决定）">结算受阻</button><button class="wa-btn" id="wa-plan-refused" title="被世界或他人拒绝 ⇒ 回到待办且不计尝试次数：拒收不是他的错">结算被拒</button></div>
       <div class="wa-row"><input id="wa-plan-reason" class="wa-input" placeholder="受阻/被拒原因（可空）"/><button class="wa-btn" id="wa-plan-candidates" title="只读：给出被卡住的步、它声明的改选路径、仍可行的后续步与剩余次数——本模块不替调用方选">看候选</button><button class="wa-btn" id="wa-plan-view" title="只读：整条计划逐步列出（含资源需求与受阻原因）">看计划</button><button class="wa-btn" id="wa-plan-abandon" title="显式放弃：留痕（已放弃的计划不删，答得出「他为什么没做成」）">放弃</button></div>
       <div id="wa-plan-out" class="wa-out"></div>
       <div class="wa-sec">关系修复（伤害 → 道歉/补偿/守约/担保 → 结案或失败）</div>
       <label class="wa-row"><input id="wa-mend-enabled" type="checkbox" ${WA.mend && WA.mend.getSettings().enabled ? 'checked' : ''}/> 启用关系修复</label>
       <div class="wa-dim">四种手段<b>不可互相顶替</b>：道歉要对方显式接受、补偿要一笔真实转移的回执、守约要有守约证据、担保要第三方。<b>没有回执不算补偿</b>；结案改关系必须显式授权，且进度不达标一律拒收。</div>
       <div class="wa-row"><input id="wa-mend-person" class="wa-input" placeholder="当事人"/><input id="wa-mend-with" class="wa-input" placeholder="对方"/><input id="wa-mend-hurt" class="wa-input" placeholder="伤的是「什么」（必填，不能只写「他伤了我」）"/></div>
       <div class="wa-row"><button class="wa-btn" id="wa-mend-mark" title="登记一次具体伤害：伤害与「感受」分开记——情绪归情绪通道，本模块记待履行的修复条件">登记伤害</button><button class="wa-btn" id="wa-mend-id" disabled>（下方 id 框）</button></div>
       <div class="wa-row"><input id="wa-mend-id2" class="wa-input" placeholder="修复 id（登记后自动回填）"/><input id="wa-mend-acceptby" class="wa-input" placeholder="谁接受了道歉"/><input id="wa-mend-guarantor" class="wa-input" placeholder="第三方担保人"/><input id="wa-mend-evidence" class="wa-input" placeholder="证据（可空）"/></div>
       <div class="wa-row"><button class="wa-btn" id="wa-mend-apology" title="道歉：只有对方显式接受才算一步（acceptedBy 是谁接受的也是证据）">记道歉</button><button class="wa-btn" id="wa-mend-restitution" title="补偿：需要一笔真实转移的回执（receipt）——「我说我赔了」不算">记补偿</button><button class="wa-btn" id="wa-mend-keeping" title="守约：需要实际守约的证据（kept）">记守约</button><button class="wa-btn" id="wa-mend-guarantee" title="担保：担保人必须是第三方（当事人自己不算）">记担保</button></div>
       <div class="wa-row"><button class="wa-btn" id="wa-mend-view" title="只读：进度、四格各自做了没有、还缺什么、最后的关系回执——「还差什么」必须当场可答">看修复</button><button class="wa-btn" id="wa-mend-close" title="结案：fulfilled 需要进度达标 + 显式授权改关系两件事同时成立；失败也是结果，照实留痕">结案</button><button class="wa-btn" id="wa-mend-fail" title="修复失败：一等公民，不删行——「他求过一次，被拒了」是复盘证据">判失败</button></div>
       <div id="wa-mend-out" class="wa-out"></div>
        <div class="wa-sec">供需循环与商路（到货 → 定价 → 成交/生产 → 时段消耗与价格响应）</div>
        <label class="wa-row"><input id="wa-eco-enabled" type="checkbox" ${WA.economy && WA.economy.getSettings().enabled ? 'checked' : ''}/> 启用供需循环</label>
        <div class="wa-dim">价格只能落在<b>许可带</b>（基础价 ± spread）内，越界一律拒收；<b>库存不为负</b>，钱不够或货不够都不改状态（拒收不是赊账）。生产只认具名配方；同一时段只能推一次，响应只影响<b>下一笔</b>。</div>
        <div class="wa-row"><input id="wa-eco-place" class="wa-input" placeholder="地点"/><input id="wa-eco-res" class="wa-input" placeholder="资源/货"/><input id="wa-eco-qty" class="wa-input wa-num" type="number" min="1" placeholder="数量"/><input id="wa-eco-base" class="wa-input wa-num" type="number" min="0" step="0.1" placeholder="基础价（首次必填）"/></div>
        <div class="wa-row"><button class="wa-btn" id="wa-eco-stock" title="到货入库：首次登记这件货必须给基础价（missing-base）——凭空的价不是价">入库</button><input id="wa-eco-price-in" class="wa-input wa-num" type="number" min="0" step="0.1" placeholder="定价"/><button class="wa-btn" id="wa-eco-price" title="定价：必须落在许可带内，越界 price-out-of-band 并带出 lo/hi（带外的价等于「这笔交易不必发生」）">定价</button><button class="wa-btn" id="wa-eco-buy" title="买：一手交钱一手交货。钱不够/货不够一律不改状态，库存不变负">买</button></div>
        <div class="wa-row"><input id="wa-eco-buyer" class="wa-input" placeholder="买主"/><input id="wa-eco-maker" class="wa-input" placeholder="生产者"/><input id="wa-eco-recipe" class="wa-input" placeholder="配方（面包/铁器）"/><input id="wa-eco-times" class="wa-input wa-num" type="number" min="1" placeholder="次数（可空取 1）"/><button class="wa-btn" id="wa-eco-craft" title="生产：配方是具名表，输入不足 short-input（带出缺什么、缺多少），够了才扣料出货">生产</button></div>
        <div class="wa-row"><input id="wa-eco-stamp" class="wa-input" placeholder="时段标记（如 D3）"/><button class="wa-btn" id="wa-eco-tick" title="时段推进：消耗 + 价格响应。同一时段只能推一次（duplicate-tick）——重复推演不得造成第二次消耗">推时段</button><button class="wa-btn" id="wa-eco-view" title="只读：当前这一件货的库存、现价、基础价与许可带">看货</button><button class="wa-btn" id="wa-eco-shelf" title="只读：某地货架">看货架</button></div>
        <div class="wa-row"><input id="wa-eco-route" class="wa-input" placeholder="商路 id"/><input id="wa-eco-lane" class="wa-input" placeholder="road/river/sea/rail"/><input id="wa-eco-from" class="wa-input" placeholder="从"/><input id="wa-eco-to" class="wa-input" placeholder="到"/><input id="wa-eco-cost" class="wa-input wa-num" type="number" min="0" placeholder="运费"/></div>
        <div class="wa-row"><button class="wa-btn" id="wa-eco-route-add" title="登记商路（已存在则改运费）">登记商路</button><button class="wa-btn" id="wa-eco-route-block" title="阻断：状态标记，不删行——世界仍记得有这条路，可解除后续运">阻断</button><button class="wa-btn" id="wa-eco-route-open" title="解除阻断">解除</button><button class="wa-btn" id="wa-eco-ship" title="经这条路运送：路受阻则 route-blocked，货不动（受阻可解除后续运，不消耗货）">运送</button><button class="wa-btn" id="wa-eco-routes" title="只读：商路台账">看商路</button></div>
<div id="wa-eco-out" class="wa-out"></div>
        <div class="wa-sec">组织制度（建档 → 设职 → 任免 → 批准链 → 交接）</div>
        <label class="wa-row"><input id="wa-inst-enabled" type="checkbox" ${WA.inst && WA.inst.getSettings().enabled ? 'checked' : ''}/> 启用组织制度</label>
        <div class="wa-dim">权限是<b>具名表</b>（approve/grant/hire/punish），自造权限一律拒收；<b>无职不任</b>、<b>一职一人</b>（换人要显式）；<b>没人能批的事不许挂起</b>；交接必须写明在途项目与旧承诺，<b>不因换人自动作废</b>。</div>
        <div class="wa-row"><input id="wa-inst-org" class="wa-input" placeholder="组织 id"/><input id="wa-inst-kind" class="wa-input" placeholder="公司/学校/家族/帮派/机关"/><input id="wa-inst-name" class="wa-input" placeholder="显示名（可空）"/><button class="wa-btn" id="wa-inst-charter" title="建档：一个组织一个 kind；重复建档须显式 replace">建档</button></div>
        <div class="wa-row"><input id="wa-inst-post" class="wa-input" placeholder="职位名"/><input id="wa-inst-perms" class="wa-input" placeholder="权限（逗号分隔：approve,grant）"/><button class="wa-btn" id="wa-inst-setpost" title="设职：权限必须落在具名权限表内——自造权限等于自造权力，下一任接不了手">设职</button></div>
        <div class="wa-row"><input id="wa-inst-person" class="wa-input" placeholder="人"/><label class="wa-row"><input id="wa-inst-replace" type="checkbox"/> 显式换人</label><button class="wa-btn" id="wa-inst-assign" title="任职：职位必须先存在；同职只一人，换人必须勾选显式换人">任职</button><button class="wa-btn" id="wa-inst-vacate" title="离任：必须写明理由（resigned/dismissed/succeeded）">离任</button></div>
        <div class="wa-row"><input id="wa-inst-why" class="wa-input" placeholder="离任理由"/><input id="wa-inst-from" class="wa-input" placeholder="交接：从"/><input id="wa-inst-to" class="wa-input" placeholder="交接：到"/><input id="wa-inst-projects" class="wa-input wa-num" type="number" min="0" placeholder="在途项目数"/><input id="wa-inst-oaths" class="wa-input wa-num" type="number" min="0" placeholder="旧承诺数"/><button class="wa-btn" id="wa-inst-succeed" title="交接：必须写明在途项目数与旧承诺数——不写明就拒收，而不是默认归零">登记交接</button></div>
        <div class="wa-row"><input id="wa-inst-dec" class="wa-input" placeholder="待批事项"/><input id="wa-inst-needs" class="wa-input" placeholder="需要的权限（默认 approve）"/><button class="wa-btn" id="wa-inst-propose" title="提一项待批：若需要的权限无人持有，一律拒收——挂起等于永远办不了">提交待批</button></div>
        <div class="wa-row"><input id="wa-inst-dec2" class="wa-input" placeholder="决策 id"/><input id="wa-inst-by" class="wa-input" placeholder="批准人"/><button class="wa-btn" id="wa-inst-approve" title="批准：批准者本人必须持有 approve——批准不是「谁点一下都行」">批准</button><button class="wa-btn" id="wa-inst-reject" title="否决：同样要有批准权">否决</button></div>
        <div class="wa-row"><input id="wa-inst-breach" class="wa-input" placeholder="违约事项"/><input id="wa-inst-penalty" class="wa-input" placeholder="罚则（必填，本模块不自行判罚）"/><button class="wa-btn" id="wa-inst-mark-breach" title="违约：必须写明罚则">记违约</button><input id="wa-inst-br2" class="wa-input" placeholder="违约 id"/><input id="wa-inst-evidence" class="wa-input" placeholder="结案依据"/><button class="wa-btn" id="wa-inst-settle" title="违约结案：必须有据">结案</button></div>
        <div class="wa-row"><button class="wa-btn" id="wa-inst-view" title="只读：职位/在任者/权限/待批数/未结违约/交接记录">看组织</button><button class="wa-btn" id="wa-inst-out-btn" title="只读：全库读数">看总览</button></div>
        <div id="wa-inst-out" class="wa-out"></div>
        <div class="wa-sec">调查卷宗（立案 → 举证 → 对质 → 定案或未决）</div>
        <label class="wa-row"><input id="wa-probe-enabled" type="checkbox" ${WA.probe && WA.probe.getSettings().enabled ? 'checked' : ''}/> 启用调查卷宗</label>
        <div class="wa-dim">立案<b>至少两条假说</b>（只有一个可能性的不是调查，是通知）；来源必须具名（rumor/report/witness/record）；<b>支持与反驳各自留行</b>不得取平均；支持够且有反证时只能定「未决」；<b>对质要有本钱</b>，误指也留痕。</div>
        <div class="wa-row"><input id="wa-probe-q" class="wa-input" placeholder="要查的问题"/><input id="wa-probe-hyps" class="wa-input" placeholder="假说（分号分隔，至少两条）"/><button class="wa-btn" id="wa-probe-open" title="立案：问题必填，至少两条假说">立案</button></div>
        <div class="wa-row"><input id="wa-probe-case" class="wa-input" placeholder="案件 id"/><input id="wa-probe-claim" class="wa-input" placeholder="线索内容"/><input id="wa-probe-level" class="wa-input" placeholder="来源等级"/><input id="wa-probe-about" class="wa-input" placeholder="指向哪条假说（h0/h1…）"/></div>
        <div class="wa-row"><input id="wa-probe-by" class="wa-input" placeholder="举证人"/><button class="wa-btn" id="wa-probe-support" title="支持：支持与反驳各自留行，不取平均">记支持</button><button class="wa-btn" id="wa-probe-refute" title="反驳：反证不合并，永远单独占一行">记反驳</button><button class="wa-btn" id="wa-probe-view" title="只读：各假说支持/反驳数与「能不能定案」">看卷宗</button></div>
        <div class="wa-row"><input id="wa-probe-who" class="wa-input" placeholder="对质对象"/><button class="wa-btn" id="wa-probe-confront" title="对质：手里证据不足 minSupport 条就不能去——「我觉得就是他」不是证据。认知变化走 intel.believe">对质</button><button class="wa-btn" id="wa-probe-decide" title="定案：支持够且无任何反证才定 guilty；否则记「未决」（证据不足是一等结论）">定案</button></div>
        <div class="wa-row"><input id="wa-probe-why" class="wa-input" placeholder="误指原因（必填）"/><button class="wa-btn" id="wa-probe-wrong" title="误指留痕：查错了人也记录在案，不静默删">记误指</button><button class="wa-btn" id="wa-probe-out-btn" title="只读：全库读数">看总览</button></div>
        <div id="wa-probe-out" class="wa-out"></div>
        <div class="wa-sec">远方传播（登记远方 → 出事 → 按里程落地）</div>
        <label class="wa-row"><input id="wa-rg-enabled" type="checkbox" ${WA.region && WA.region.getSettings().enabled ? 'checked' : ''}/> 启用远方传播</label>
        <div class="wa-dim">远方必须写明<b>距离与渠道</b>（没有它们就算不出延迟）；<b>未到期不许提前落地</b>；路断不吞事——消息在原地等，解除后照常到；<b>本地逐条明细、远方只给类型与时辰</b>。</div>
        <div class="wa-row"><input id="wa-rg-place" class="wa-input" placeholder="远方名"/><input id="wa-rg-days" class="wa-input wa-num" type="number" min="0" step="0.5" placeholder="距本地多少天"/><input id="wa-rg-lane" class="wa-input" placeholder="road/river/rail/word"/><button class="wa-btn" id="wa-rg-register" title="登记远方：距离与渠道都是必需的（missing-distance）">登记远方</button></div>
        <div class="wa-row"><input id="wa-rg-kind" class="wa-input" placeholder="market/strife/plague/disaster/feast"/><input id="wa-rg-text" class="wa-input" placeholder="细节（可空）"/><button class="wa-btn" id="wa-rg-occur" title="远方出事：事件类型必须具名；登记即进入传播队列（延迟 = 距离 ÷ 渠道速率）">记出事</button><button class="wa-btn" id="wa-rg-view" title="只读：远方拓扑与事件台账">看台账</button></div>
        <div class="wa-row"><input id="wa-rg-eid" class="wa-input" placeholder="事件 id"/><button class="wa-btn" id="wa-rg-deliver" title="落地：未到期一律拒收（too-early），路阻则原地等（route-blocked）">落地</button><input id="wa-rg-why" class="wa-input" placeholder="阻断原因"/><button class="wa-btn" id="wa-rg-block" title="阻断通路：状态标记，不删行">阻断</button><button class="wa-btn" id="wa-rg-open" title="解除阻断">解除</button></div>
        <div class="wa-row"><input id="wa-rg-who" class="wa-input" placeholder="听说的人"/><button class="wa-btn" id="wa-rg-heard" title="本地认知：只有已落地的事件才被听说，且传闻会随时间变淡">听说了什么</button><button class="wa-btn" id="wa-rg-fine" title="近处精细、远处粗粒度：本地逐条明细，远方只给类型与时辰">看粒度</button><button class="wa-btn" id="wa-rg-out-btn" title="只读：全库读数">看总览</button></div>
        <div id="wa-rg-out" class="wa-out"></div>
        <div class="wa-sec">玩法进度（采纳玩法包 → 记进度 → 声明迁移 → 换阶段）</div>
        <label class="wa-row"><input id="wa-st-enabled" type="checkbox" ${WA.stage && WA.stage.getSettings().enabled ? 'checked' : ''}/> 启用玩法进度</label>
        <div class="wa-dim">玩法包必须<b>具名</b>（都市生活/经营/悬疑/冒险）；指标是包声明的且<b>只能递增</b>；迁移必须写明<b>条件与清单</b>；<b>清单未落实就不得进入下一阶段</b>；未达条件的迁移不进正文（不剧透）。</div>
        <div class="wa-row"><input id="wa-st-pack" class="wa-input" placeholder="玩法包"/><label class="wa-row"><input id="wa-st-replace" type="checkbox"/> 显式换包</label><button class="wa-btn" id="wa-st-adopt" title="采纳玩法包：包名必须具名，且一套一采纳（换包要显式）">采纳</button></div>
        <div class="wa-row"><input id="wa-st-metric" class="wa-input" placeholder="指标（包声明）"/><input id="wa-st-delta" class="wa-input wa-num" type="number" min="0.1" step="0.1" placeholder="增量（只能为正）"/><button class="wa-btn" id="wa-st-mark" title="记进度：指标必须在包声明的表内，且只能递增——成就不可回卷">记进度</button></div>
        <div class="wa-row"><input id="wa-st-to" class="wa-input" placeholder="下一阶段"/><input id="wa-st-need" class="wa-input wa-num" type="number" min="0" step="1" placeholder="门槛"/><input id="wa-st-changes" class="wa-input" placeholder="要变的槽位（逗号分隔）"/><button class="wa-btn" id="wa-st-plan" title="声明迁移：触发条件与迁移清单缺一不可">声明迁移</button></div>
        <div class="wa-row"><input id="wa-st-tid" class="wa-input" placeholder="迁移 id"/><input id="wa-st-applied" class="wa-input" placeholder="已落实的槽位（逗号分隔）"/><button class="wa-btn" id="wa-st-transit" title="换阶段：门槛未达拒收；清单未逐项确认已生效也拒收（换阶段不是一句宣告）">换阶段</button></div>
        <div class="wa-row"><button class="wa-btn" id="wa-st-view" title="只读：当前阶段、指标、已声明未到的迁移与已完成的迁移">看进度</button><button class="wa-btn" id="wa-st-out-btn" title="只读：全库读数">看总览</button></div>
        <div id="wa-st-out" class="wa-out"></div>
        <div class="wa-sec">多人场（入座 → 验票 → 发言 → 续传/重同步）</div>
        <label class="wa-row"><input id="wa-se-enabled" type="checkbox" ${WA.session && WA.session.getSettings().enabled ? 'checked' : ''}/> 启用多人场</label>
        <div class="wa-dim">入座<b>必须持票</b>（只存指纹，不落明文）；一个名字一个座、<b>角色独占</b>（接管要显式）；发言<b>序号必须连续</b>；越窗不许假装没漏，<b>必须重同步</b>；视点按权限过滤（主持人看全量）。</div>
        <div class="wa-row"><input id="wa-se-name" class="wa-input" placeholder="名字"/><input id="wa-se-role" class="wa-input" placeholder="角色"/><input id="wa-se-token" class="wa-input" placeholder="凭证（本机留存，不写进状态）"/><label class="wa-row"><input id="wa-se-takeover" type="checkbox"/> 显式接管</label></div>
        <div class="wa-row"><button class="wa-btn" id="wa-se-host" title="开主持座：主持人是权限最全的座">开主持</button><input id="wa-se-perms" class="wa-input" placeholder="权限（逗号分隔：post,decide）"/><button class="wa-btn" id="wa-se-join" title="玩家入座：重名拒收；角色被占除非勾选接管；权限必须是具名表子集">入座</button><button class="wa-btn" id="wa-se-auth" title="验票：只认凭证，不认「他说他是谁」">验票</button></div>
        <div class="wa-row"><input id="wa-se-body" class="wa-input" placeholder="发言内容"/><input id="wa-se-seq" class="wa-input wa-num" type="number" min="1" placeholder="顺序号（可空取下一个）"/><button class="wa-btn" id="wa-se-post" title="发言：顺序号必须连续（跳号拒收，带出期望值）">发言</button></div>
        <div class="wa-row"><input id="wa-se-last" class="wa-input wa-num" type="number" min="0" placeholder="已收到的最大序号"/><button class="wa-btn" id="wa-se-since" title="续传：越窗一律拒收，必须先重同步">续传</button><button class="wa-btn" id="wa-se-resync" title="重同步：给带版本号与历史水位的快照">重同步</button><button class="wa-btn" id="wa-se-leave" title="卸座：不删已发消息（历史不可篡改）">卸座</button></div>
        <div class="wa-row"><button class="wa-btn" id="wa-se-view" title="只读：按权限过滤的视点（主持人看全量）">看视点</button><button class="wa-btn" id="wa-se-out-btn" title="只读：在场与进度总览">看总览</button></div>
        <div id="wa-se-out" class="wa-out"></div>
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
      <div class="wa-sec">原著幕目（把原著长文本切成「幕 → 剧情点」，只切分不改写）</div>
      <label class="wa-row"><input id="wa-cn-enabled" type="checkbox" ${WA.canon && WA.canon.getSettings().enabled ? 'checked' : ''}/> 启用原著幕目</label>
      <div class="wa-row"><input id="wa-cn-peract" class="wa-input wa-num" type="number" min="1" max="40" value="${WA.canon ? WA.canon.getSettings().perAct : 6}" title="每幕合并多少节（节 = 该点数的剧情点）。架构源 ADR-0009 的「幕数 ≈ 节数/6」即此值取 6。调小 ⇒ 幕更密"/><button class="wa-btn" id="wa-cn-build" title="纯计算：按字符/段落边界切分成「幕 → 剧情点」，只切分不改写，**不采纳**（不写存档）。要落盘请再点「采纳」">切分试算</button><button class="wa-btn" id="wa-cn-adopt" title="唯一写入口：把上一次试算的大纲落盘（原著全文**不入存档**，只落可定位的骨架）。已采纳过则覆盖并留下 replacedAt">采纳大纲</button></div>
      <textarea id="wa-cn-text" class="wa-ta" placeholder="把原著正文粘在这里（只用于本次切分，不会进存档）——超上限一律拒收，不静默截断"></textarea>
      <div class="wa-row"><input id="wa-cn-src" class="wa-input" placeholder="来源备注（第几卷/哪个译本，可空）"/><input id="wa-cn-coord" class="wa-input" placeholder="定位坐标（如 A3.5）"/><button class="wa-btn" id="wa-cn-locate" title="按幕/点坐标定位回原文骨架——坐标是标出来的，越界一律照实说「不成立」，不夹到边界">定位</button><button class="wa-btn" id="wa-cn-view" title="只读：已采纳哪一份大纲、多少幕多少点、有没有被截断（截断必须报出，不然你会以为全整理完了）">当前大纲</button><button class="wa-btn" id="wa-cn-clear" title="清掉已采纳的大纲（只清大纲，不动世界状态）">清空</button></div>
       <div class="wa-row"><input id="wa-cn-check" class="wa-input" placeholder="贴当前这一段正文，看它最像原著哪一幕（对的是题名，不是正文）"/><button class="wa-btn" id="wa-cn-signal" title="拿你贴的这段文本去撞幕目题名，报「最像第几幕」**并给证据**（共有的二字片段是哪几个）。说不出证据的读数只能让人替引擎背书。粒度是题名级——原著正文不入存档，故引擎手里只有题名">对位试算</button><button class="wa-btn" id="wa-cn-position" title="拿**世界侧已经发生的事**（纪事 / 暗流 / 回声 / 章节）去撞幕目题名，答「现在最接近原著第几幕」。它是猜测、不是判定——「有没有偏离」由你看着这些证据自己说">用世界侧历史对位</button><button class="wa-btn" id="wa-cn-gap" title="按上面的幕号，答「还剩几幕」= 总数 − 这个幕号。**只报数，不判偏离**：「还剩 4 幕」是事实，「所以你不该在这里」是判定，判定不是引擎的活">看推进度</button><button class="wa-btn" id="wa-cn-deviation" title="偏离度量化：当前世界侧历史 vs 已采纳大纲的事件差异（撞上了哪几幕）与推进度，给出 score ∈ [0,1]（0 = 严格遵循）。**只报不改**——偏离不自动拉回；且 spread（散不散）与 lag（快不快）各自报出，合成一个数就答不出偏在哪一种偏法上">偏离度</button><button class="wa-btn" id="wa-cn-trend" title="偏离曲线（最近若干轮）：**怎么走到今天**的走势，而不是「今天怎么样」的另一个说法。用它看「是不是越走越远」——单点分数看不出这件事">偏离曲线</button></div>
       <div id="wa-cn-out" class="wa-out"></div>
       <div class="wa-row"><input id="wa-cn-actno" class="wa-input wa-num" type="number" min="1" placeholder="幕号"/><input id="wa-cn-ptno" class="wa-input wa-num" type="number" min="1" placeholder="点号（可空 = 整幕）"/><button class="wa-btn" id="wa-cn-go" title="按幕/点号拼出坐标再定位。拼坐标这一步**只有 coordOf 一处实现**——面板不自己拼 'A'+a+'.'+p：手拼的写法会绕开边界判定，于是 A0 / A999 这类号先被拼出来再撞进 locate，报错理由从「号不对」（bad-coord）变成「越界」（out-of-range），两句话的处置完全不同">按号定位</button><button class="wa-btn" id="wa-cn-act" title="取某一幕的剧情点题名（作者面，不进正文）。与「当前大纲」分列：那个答「整理到哪了」，这个答「这一幕里有哪些点」">看这一幕的点</button></div>
      <div class="wa-sec">传播与辟谣（一条事实在人际间怎么传、传到最后还是不是原来那条）</div>
      <label class="wa-row"><input id="wa-rm-enabled" type="checkbox" ${WA.rumor && WA.rumor.getSettings().enabled ? 'checked' : ''}/> 启用传播与辟谣</label>
      <div class="wa-row"><input id="wa-rm-fact" class="wa-input" placeholder="事实 key（须已在世界事实里）"/><button class="wa-btn" id="wa-rm-start" title="起一条传播链：一事实一链（同一件事不该有两条互不相干的链）——事实没登记一律拒收，不凭空造一条">起链</button><button class="wa-btn" id="wa-rm-investigate" title="证据调查：逐跳列出经手人，并回答那个唯一的问题——传到最后还是不是原来那条。纯读，不改任何状态">调查</button><button class="wa-btn" id="wa-rm-fullview" title="全知视图（四层全出）：给作者看底牌，含被隐瞒者与已被改写者；不进正文">全知视图</button></div>
      <div class="wa-row"><input id="wa-rm-id" class="wa-input" placeholder="链 id（rm_事实key）"/><input id="wa-rm-from" class="wa-input" placeholder="经手人（从）"/><input id="wa-rm-to" class="wa-input" placeholder="经手人（到）"/></div>
      <div class="wa-row"><input id="wa-rm-motive" class="wa-input" placeholder="动机 honest/conceal/distort/refute"/><input id="wa-rm-value" class="wa-input" placeholder="值（只有歪曲能动）"/><input id="wa-rm-layer" class="wa-input" placeholder="层（留空即自动下一层；只能往更不真走）"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-rm-relay" title="转述一跳：没声明要改就不许改值——随手动改值（未声明）一律拒收，那是账面上最危险的一种错">转述</button><button class="wa-btn" id="wa-rm-refute" title="辟谣：改的是「有人不再当它是一回事」，不是「这件事没发生过」——事实与层都不动">辟谣</button><button class="wa-btn" id="wa-rm-conceal" title="隐瞒：有人知道但没往外传。它不是一次传播，故另记「隐瞒」而不混进跳数（隐瞒者取『经手人（从）』，理由取右侧栏）">隐瞒</button></div>
      <div class="wa-row"><input id="wa-rm-person" class="wa-input" placeholder="人物（查某人可见）"/><input id="wa-rm-why" class="wa-input" placeholder="隐瞒理由"/><button class="wa-btn" id="wa-rm-visible" title="某人在本链上看得到什么——只出事实与亲历两层；转述与流言不过玩家面">查可见</button></div>
      <div id="wa-rm-out" class="wa-out"></div>
      <div class="wa-sec">跨插件因果桥（入站：手机侧的动作怎么进世界）</div>
      <label class="wa-row"><input id="wa-pb-enabled" type="checkbox" ${WA.phoneBridge && WA.phoneBridge.getSettings().enabled ? 'checked' : ''}/> 启用跨插件因果桥</label>
      <div class="wa-row"><input id="wa-pb-opid" class="wa-input" placeholder="opId（手机侧那笔操作的唯一号）"/><input id="wa-pb-act" class="wa-input" placeholder="act message/pin/block/unblock"/><input id="wa-pb-to" class="wa-input" placeholder="对象（拉黑谁 / 回给谁）"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-pb-note" title="登记一笔手机侧操作：按 opId 幂等（重复上报返回 reused 而不是第二条——手机侧重试是常态）；不认识的动作一律拒收 unknown-act，让外部替本扩展决定因果词汇表是更坏的选项">记一笔操作</button><button class="wa-btn" id="wa-pb-view" title="入站台账视图：最近几笔 + 未接链笔数 + 手机侧推送相位（相位三态，unknown 不等于 quiet）">看台账</button></div>
      <div class="wa-row"><input id="wa-pb-chain" class="wa-input" placeholder="因果链 id（须已存在）"/><button class="wa-btn" id="wa-pb-link" title="把这笔操作接到一条因果链上：链必须已存在（接一条不存在的链 = 用桥给世界造一条因果）；已接过别的链不覆盖（静默改写会让「这条链的因」事后被换掉而没人知道）">接链</button><button class="wa-btn" id="wa-pb-trace" title="追溯：一笔操作 → 它接在哪条链上（反过来问「这条链的因是不是手机侧」由因果工作台的证据面答）">查追溯</button></div>
      <div id="wa-pb-out" class="wa-out"></div>
      <div class="wa-sec">因果链追踪（现在这个状态从哪一步来；撤回那一步会让谁失准）</div>
      <label class="wa-row"><input id="wa-ch-enabled" type="checkbox" ${WA.chrono && WA.chrono.getSettings().enabled ? 'checked' : ''}/> 启用因果链追踪</label>
      <div class="wa-row"><input id="wa-ch-anchor" class="wa-input" placeholder="锚点（改了哪条设定）"/><input id="wa-ch-base" class="wa-input" placeholder="踩在哪条记录上（空=根）"/><input id="wa-ch-note" class="wa-input" placeholder="备注（可空）"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-ch-record" title="登记一次变更：依赖只认显式反向引用，不按时间接近去猜">记一步</button><button class="wa-btn" id="wa-ch-stale" title="只读：哪些下游踩在已被撤回的事实上（失准名单，不悄悄修）">失准名单</button><button class="wa-btn" id="wa-ch-undo" title="试算撤销：只回答「会让你看到什么」，不写世界">试算撤销</button><button class="wa-btn" id="wa-ch-apply" title="真撤销必须二次确认：追加一条 revert，不抹历史">确认撤销</button></div>
      <div id="wa-ch-out" class="wa-out"></div>
      <div class="wa-sec">协作会话（谁占着哪个角色、待重放队列、两端分歧）</div>
      <label class="wa-row"><input id="wa-co-enabled" type="checkbox" ${WA.collab && WA.collab.getSettings().enabled ? 'checked' : ''}/> 启用协作会话</label>
      <div class="wa-row"><input id="wa-co-sid" class="wa-input" placeholder="会话 id"/><input id="wa-co-who" class="wa-input" placeholder="角色 / 操作人"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-co-open" title="打开一个会话：不限制同时在线、不踢人">开会话</button><button class="wa-btn" id="wa-co-claim" title="占用角色：已被别人占用则 claimed-by-other，不静默夺取">占角色</button><button class="wa-btn" id="wa-co-pending" title="只读：待重放队列（同 opId 不产生第二条）">待重放</button><button class="wa-btn" id="wa-co-conflicts" title="只读：尚未裁决的两端分歧（单边改动不是冲突）">未裁决冲突</button></div>
      <div id="wa-co-out" class="wa-out"></div>
      <div class="wa-sec">协作任务与违约（约好一起做什么、到点各人做到没有）</div>
      <div class="wa-row"><input id="wa-task-goal" class="wa-input" placeholder="目标（如 修水渠）"/><input id="wa-task-partners" class="wa-input" placeholder="参与人：甲:3,乙:3（冒号后是承诺量，可省）"/><input id="wa-task-deadline" class="wa-input" placeholder="多少秒后截止（如 600）"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-task-create" title="建一个协作任务：参与人须属同一势力（缺归属与分属两家分开报）——多势力协作要先建联合势力，不把两家合成一个任务">建任务</button><button class="wa-btn" id="wa-task-view" title="只读：活跃/完成/违约三桶 + 违约记录数与真罚数（两个数不可合并：一个答『记下了』、一个答『真罚了』）">任务读数</button></div>
      <div class="wa-row"><input id="wa-task-id" class="wa-input" placeholder="任务号（如 T1）"/><input id="wa-task-person" class="wa-input" placeholder="人物（罚没可留空=按违约名单逐人）"/><input id="wa-task-amount" class="wa-input" placeholder="数额（贡献/罚没）"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-task-contribute" title="记一笔贡献：只有正数（回撤不是贡献）；不在任务名册上的人拒收 not-on-roster">记贡献</button><button class="wa-btn" id="wa-task-settle" title="到点结算：未到截止拒收 not-due；本操作只记不罚（缺缴者进违约名单），真罚要另按罚没">结算</button><button class="wa-btn" id="wa-task-penalize" title="显式罚没：逐人交给 org.penalize（本人 → 势力的一次转移），结果原话转述；未结算的任务不许罚（还没有违约名单）">罚没</button></div>
      <div id="wa-task-out" class="wa-out"></div>

      <div class="wa-sec">插件钩子（进程内生命周期；不做市场／REST）</div>
      <div class="wa-row"><input id="wa-pl-name" class="wa-input" placeholder="插件名…"/><button class="wa-btn" id="wa-pl-reg" title="注册一个只记日志的 beforeSave 示例插件">注册示例</button><button class="wa-btn" id="wa-pl-unreg" title="按名字卸载已注册的插件（注册的逆操作；不留残钩）">卸载</button><button class="wa-btn" id="wa-pl-list" title="只读已注册插件">列表</button><button class="wa-btn" id="wa-pl-fire" title="只读触发计数">读数</button></div>
      <div id="wa-pl-out" class="wa-out"></div>
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
        : `<div class="wa-row"><input id="wa-de-prompt" class="wa-input" placeholder="事件要求（可空）…"/><input id="wa-de-turns" aria-label="生成轮数" class="wa-input wa-w60" type="number" value="6" min="1" max="30"/><button class="wa-btn" id="wa-de-create" title="生成一场分轮次的突发事件（每轮推进一个阶段）">生成事件</button></div>`}

      ${digest && digest.text ? `<div class="wa-sec">世界推演叙事</div><div class="wa-item wa-digest">${esc(digest.text)}</div>` : ''}

      <div class="wa-sec">势力（${factions.length}）</div>
      <div class="wa-list">${factions.slice(0,6).map(f => `<div class="wa-item">${factionBadge(f.status)} <b>${esc(f.name)}</b> <span class="wa-badge">${esc(f.status)}</span> <span class="wa-dim">${relBadge(f.relation)}${esc(f.relation)}</span>${f.currentGoal ? `<div class="wa-dim">目标：${esc(f.currentGoal)}</div>` : ''}</div>`).join('') || '<div class="wa-empty">暂无势力</div>'}</div>
      ${(() => {
        // v2.139.0（E9）：势力**关系网**读数。
        //   它治的病：上面那一行列表只逐势力报「它对主视角的态度」，而「谁跟谁一伙、
        //   谁跟谁对着」在这张面板上此前**完全不可见**（逐行求和 ≠ 图）。
        //   三个按钮各答一个问题、**互不替代**：
        //     · 张力 —— 整张网有多紧（一个数，含分母，可复算）；
        //     · 同盟簇 —— 图被分成几块（含单点，否则「团数」会被读成「块数」）；
        //     · 关系网 —— 逐条边（**带 basis**：这条边由哪两个字段算出来的，随时可复盘）。
        //   四种未算成的情形**一律显式报出**，不留空面板：
        //     模块缺席 / 开关未开 / 无势力 / 空图 —— 空白面板会把「没算」与「算出来是空的」塌成一件事。
        const FG = WA.factionGraph;
        if (!FG) return '<div class="wa-dim">势力关系网未加载</div>';
        const fr = panelEl.dataset.fgOut || '';
        return `<div class="wa-row">`
          + `<button class="wa-btn wa-mini" id="wa-fg-tension" aria-label="势力关系网张力" title="全局张力 = 敌对边权重和 ÷ 有效边数（分母是边数，可复算；零边时如实标注分母被保护）">张力</button>`
          + `<button class="wa-btn wa-mini" id="wa-fg-clusters" aria-label="势力关系网同盟簇" title="同盟簇 = 倾向达到「盟友」档及以上的连通子图；单点势力单列（不并入簇数，否则「同盟团数」会被读成「图分成几块」）">同盟簇</button>`
+ `<button class="wa-btn wa-mini" id="wa-fg-edges" aria-label="势力关系网逐条边" title="逐条边 JSON（含 basis：这条边由哪两个势力的对外态度算出）。边是**推导值**，不是观测到的势力间关系">关系网</button>`
           + `</div><div class="wa-row">`
           + `<input id="wa-fg-pa" class="wa-input" aria-label="势力关系网查边甲" placeholder="势力甲（查两家关系）"/>`
           + `<input id="wa-fg-pb" class="wa-input" aria-label="势力关系网查边乙" placeholder="势力乙"/>`
           + `<button class="wa-btn wa-mini" id="wa-fg-pair" aria-label="势力关系网查两家关系" title="就这两家到底什么关系：给出档位与亲疏，并带出这条边的依据（由哪两个对外态度推出）。自环与未知势力名一律报 bad-faction —— 「自己跟自己」不是一条边">查两家</button>`
           + `<button class="wa-btn wa-mini" id="wa-fg-hot" aria-label="势力关系网最紧张者" title="逐节点热度排行：谁跟最多家敌对、谁跟最多家同盟。unknowns 单列 —— 「档位不在词表里、算不出来」与「真的没有敌对」绝不同形">最紧张</button>`
           + `</div><div id="wa-fg-out" class="wa-out wa-dim">${esc(fr)}</div>`;
      })()}

      <div class="wa-sec">势力外交（成对事实）</div>
      <div class="wa-item">
        <div class="wa-dim">与上面的「关系网」<b>不是同一个东西</b>：那一栏是<b>推导值</b>（按双方各自的对外态度算出来的图，<code>derived:true</code>），这一栏是<b>谈成的事实</b>（成对条目 / 双边态度 / 条约 / 有效期 / 履约回执）。推导结果<b>不会</b>自动迁成事实 —— 「算出来的」不许冒充「谈成的」。</div>
        ${(() => {
          const DP = WA.diplomacy;
          if (!DP) return '<div class="wa-dim">势力外交未加载</div>';
          const dr = panelEl.dataset.dpOut || '';
          const dpOn = (WA.diplomacy.getSettings && WA.diplomacy.getSettings().enabled) ? true : false;
          return `<div class="wa-row"><label class="wa-row"><input id="wa-dp-enabled" type="checkbox" ${dpOn ? 'checked' : ''}/> 启用势力外交</label></div><div class="wa-row">`
            + `<button class="wa-btn wa-mini" id="wa-dp-view" aria-label="外交总览" title="全部成对条目与未结提案：状态 / 双边态度 / 有效条款（带到期日）/ 未结提案阶段。两个「没得看」的态分开报：开关关着 vs 一对都没谈过">外交总览</button>`
            + `<input id="wa-dp-a" class="wa-input" aria-label="外交查对甲" placeholder="势力甲"/>`
            + `<input id="wa-dp-b" class="wa-input" aria-label="外交查对乙" placeholder="势力乙"/>`
            + `<button class="wa-btn wa-mini" id="wa-dp-pair" aria-label="查一对关系" title="就这两家此刻是什么关系：状态 + 两个方向各自的态度（非对称态度必须保留，不合成一个数）。没有成对条目就是 unknown —— 「未接触」不等于「中立」（中立是一个谈成过的状态）">查这对</button>`
            + `<button class="wa-btn wa-mini" id="wa-dp-applies" aria-label="查条款适用性" title="这一条款此刻对这两家适用吗：只回答适用性（生效中 = 适用），资源后果由调用方经 org 完成。未接触（unknown）时报「不适用」——「没谈过」与「谈崩了」绝不同形">条款适用？</button>`
            + `</div><div class="wa-row">`
            + `<input id="wa-dp-from" class="wa-input" aria-label="提案发起方" placeholder="发起方"/>`
            + `<input id="wa-dp-to" class="wa-input" aria-label="提案受方" placeholder="受方"/>`
            + `<input id="wa-dp-terms" class="wa-input" aria-label="条款" placeholder="条款（trade / mutual-aid / armistice / embargo，逗号分隔）"/>`
            + `<button class="wa-btn wa-mini" id="wa-dp-propose" aria-label="提出外交提案" title="提出提案：不产生正式世界效果（只落 proposals）。预检顺序固定：开关 → 字段 → 势力存在性 → 条款 → 时长 → 容量。自造条款一律拒收 —— 条款不成表，执行方就无从写代码">提提案</button>`
            + `</div><div class="wa-row">`
            + `<input id="wa-dp-id" class="wa-input" aria-label="提案号" placeholder="提案号"/>`
            + `<select id="wa-dp-kind" class="wa-input" aria-label="答复种类"><option value="accept">接受</option><option value="counter">还价</option><option value="reject">拒绝</option></select>`
            + `<input id="wa-dp-basis" class="wa-input" aria-label="答复依据" placeholder="答复依据（必填）"/>`
            + `<button class="wa-btn wa-mini" id="wa-dp-reply" aria-label="答复提案" title="作出有据答复：必须给 by（受方）与 basis（依据）。没有依据的答复一律拒收 —— 「为什么答应 / 为什么拒绝」是这条链上唯一值得留存的东西">答复</button>`
            + `<button class="wa-btn wa-mini" id="wa-dp-sign" aria-label="确认签约" title="确认签约：这一步才写 pairs。四道门：开关 → 提案为 accepted → 权限预检（读 inst.authority 真源；查不到 inst 一律拒收，不作默许放行）→ 容量。已生效的同名条款不重复签（duplicate-term）">确认签约</button>`
            + `</div><div class="wa-row">`
            + `<input id="wa-dp-pairid" class="wa-input" aria-label="成对号" placeholder="成对号（pairId）"/>`
            + `<input id="wa-dp-term" class="wa-input" aria-label="条款" placeholder="条款（trade 等）"/>`
            + `<input id="wa-dp-ev" class="wa-input" aria-label="证据" placeholder="证据（必填）"/>`
            + `<button class="wa-btn wa-mini" id="wa-dp-fulfil" aria-label="履约回执" title="履约回执：必须有据（谁在何时怎么做到）。无据的「完成了」不结算 —— 同一完成证据不得重复结算（已结算再报 already）">履约</button>`
            + `<button class="wa-btn wa-mini" id="wa-dp-breach" aria-label="违约留证" title="违约留证：本模块不判罚，只把条款标成 breached 并留证；罚则与资源后果由调用方（inst / org）决定">违约</button>`
            + `<button class="wa-btn wa-mini" id="wa-dp-expire" aria-label="到期收敛" title="到期收敛：把到期条款标成 expired 并按剩余条款重算关系状态。幂等 —— 同一个时刻连调两次，第二次零改动（changed:0）">到期</button>`
            + `</div><div id="wa-dp-out" class="wa-out wa-dim">${esc(dr)}</div>`;
        })()}
      </div>
      <div class="wa-sec">行动调度（动机 / 计划 / 行动闭环）</div>
      <div class="wa-item">
        <div class="wa-dim">人物有目标、目标有计划步、行动有回执——回执驱动步结算，不是定时器自动推。<b>不凭空造</b>：目标 / 计划 / 行动各自是唯一写者的产物，本模块只协调。</div>
        ${(() => {
          const AG = WA.agency;
          if (!AG) return '<div class="wa-dim">行动调度未加载</div>';
          const ar = panelEl.dataset.agOut || '';
          const agOn = (WA.agency.getSettings && WA.agency.getSettings().enabled) ? true : false;
return `<div class="wa-row"><label class="wa-row"><input id="wa-ag-enabled" type="checkbox" ${agOn ? 'checked' : ''}/> 启用行动闭环</label></div><div class="wa-row">`
            + `<input id="wa-ag-person" class="wa-input" aria-label="人物名" placeholder="人物名"/>`
            + `<button class="wa-btn wa-mini" id="wa-ag-schedule" aria-label="调度行动" title="调度行动：读该人物当前目标与计划步 → 检查前置 → 准入一个行动。无计划时返回 need-steps（本模块不编步骤，步骤由 AI 文本经结构预检产生或由预设模板提供）">调度行动</button>`
            + `<button class="wa-btn wa-mini" id="wa-ag-receipts" aria-label="处理回执" title="处理回执：读已完成的行动台帐 → 结算步 → 更新目标进度。行动回执驱动步结算——不是定时器自动推进步">处理回执</button>`
            + `<button class="wa-btn wa-mini" id="wa-ag-diag" aria-label="诊断" title="诊断：检查 life / plan / act 三模块均在 + 闭环完整性。自证面汇报模块出席与接线状况">诊断</button>`
            + `</div><div id="wa-ag-out" class="wa-out wa-dim">${esc(ar)}</div>`;
        })()}
      </div>
      <div class="wa-sec">货运在途（守恒运输）</div>
      <div class="wa-item">
        <div class="wa-dim">economy.ship 是即时补货（旧语义保留）。本段是守恒运输：源扣减→在途→到货。<b>不凭空造库存</b>：economy.goods 是库存唯一真源。</div>
        ${(() => {
          const FR = WA.freight;
          if (!FR) return '<div class="wa-dim">货运未加载</div>';
          const fr = panelEl.dataset.frOut || '';
          const frOn = (FR.getSettings && FR.getSettings().enabled) ? true : false;
          return '<div class="wa-row"><label class="wa-row"><input id="wa-fr-enabled" type="checkbox" ' + (frOn ? 'checked' : '') + '/> 启用守恒运输</label></div><div class="wa-row">'
            + '<input id="wa-fr-route" class="wa-input wa-mini" aria-label="路线ID" placeholder="路线ID" value="r1"/>'
            + '<input id="wa-fr-from" class="wa-input wa-mini" aria-label="出发地" placeholder="出发地" value="城中集市"/>'
            + '<input id="wa-fr-res" class="wa-input wa-mini" aria-label="资源" placeholder="资源" value="布匹"/>'
            + '<input id="wa-fr-qty" class="wa-input wa-mini" aria-label="数量" placeholder="数量" value="10"/>'
            + '<input id="wa-fr-days" class="wa-input wa-mini" aria-label="天数" placeholder="天数" value="3"/>'
            + '</div><div class="wa-row">'
            + '<button class="wa-btn wa-mini" id="wa-fr-dispatch" aria-label="发运" title="发运：扣源库存→创建在途记录">发运</button>'
            + '<button class="wa-btn wa-mini" id="wa-fr-arrive" aria-label="到货" title="到货：在途→目的地库存">到货</button>'
            + '<button class="wa-btn wa-mini" id="wa-fr-cancel" aria-label="取消" title="取消：退货至源、损运费">取消</button>'
            + '<button class="wa-btn wa-mini" id="wa-fr-reroute" aria-label="改道" title="改道：换路线、重估ETA">改道</button>'
            + '<button class="wa-btn wa-mini" id="wa-fr-view" aria-label="查看" title="查看：单笔货运守恒校验">查看</button>'
            + '<button class="wa-btn wa-mini" id="wa-fr-diag" aria-label="诊断" title="诊断：economy+store双在+闭环完整性">诊断</button>'
            + '</div><div id="wa-fr-out" class="wa-out wa-dim">' + esc(fr) + '</div>';
        })()}
      </div>

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
        <div class="wa-row"><input id="wa-ee-name" class="wa-input" placeholder="事件名"/><select id="wa-ee-type" aria-label="事件类型" class="wa-input wa-w60"><option value="conflict">冲突型</option><option value="progress">推进型</option></select><button class="wa-btn" id="wa-ee-add">新增事件</button></div>
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
          + '<div class="wa-row"><select id="wa-ent-type" aria-label="实体类型" class="wa-input wa-w60">' + opts + '</select>'
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
  // v2.99.0：原著幕目的「试算产物」暂存槽。**必须住在闭包变量**而不是 dataset：
  //   它的体积随原著篇幅线性增长（上限 MAX_TEXT=4MB 级），塞进 DOM 属性等于把整份大纲
  //   复制到属性树上；而 renderBody() 整块重建 DOM，属性本来也留不住。
  //   注意「留得住」的只是它——用户可以切页回来看，但面板重绘后按钮仍要重按（这是有意的：
  //   采纳是**写存档**动作，「上次试算」不该跨重绘静默生效）。
  let __cnBuilt = null;
  // v2.154.0（RX4）：上一次导出的传说包暂存槽。同 __cnBuilt 的理由 —— 它的体积随编年史条数增长
  //   （整包 JSON），塞进 DOM 属性等于把整份包复制到属性树上，而 renderBody() 整块重建 DOM。
  //   「留得住」的只是**内容**：用户可以切页回来再导一次；导出本身是纯读，故留得住也不构成静默写。
  let __nbPack = null;

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
      + ' <select id="wa-pw-mode" aria-label="推进模式" class="wa-input wa-w60"><option value="manual"' + (cfg.autoMode === 'manual' ? ' selected' : '') + '>手动</option><option value="per_turn"' + (cfg.autoMode === 'per_turn' ? ' selected' : '') + '>每轮推进</option><option value="every_n"' + (cfg.autoMode === 'every_n' ? ' selected' : '') + '>每N轮</option><option value="dice"' + (cfg.autoMode === 'dice' ? ' selected' : '') + '>骰子（1/6）</option></select>'
      + ' <input type="number" id="wa-pw-int" class="wa-input wa-w60" min="1" max="50" value="' + cfg.autoInterval + '" title="每N轮推进的N" disabled>'
      + ' <label class="wa-node"><input type="checkbox" id="wa-pw-dice" ' + (cfg.diceEnabled ? 'checked' : '') + '><span class="wa-node-label">骰子</span></label>'
      + ' <select id="wa-pw-detail" aria-label="推进明细" class="wa-input wa-w60"><option value="brief"' + (cfg.detailLevel === 'brief' ? ' selected' : '') + '>简</option><option value="normal"' + (cfg.detailLevel === 'normal' ? ' selected' : '') + '>中</option><option value="rich"' + (cfg.detailLevel === 'rich' ? ' selected' : '') + '>丰</option></select>'
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
    // v2.150.0(RP4): 注入价值三枚控件的当前值。取不到时按模块 DEF 兜底（渲染不因模块缺席而消失：
    //   控件在场而模块不在 ⇒ 点下去会如实报 module-missing，比「控件凭空不见」可诊断）。
    const ivCfg = (function () {
      try { return (WA.injectValue && WA.injectValue.getSettings) ? WA.injectValue.getSettings() : { enabled: true, zeroRefRounds: 3, maxKeys: 12 }; }
      catch (e) { return { enabled: true, zeroRefRounds: 3, maxKeys: 12 }; }
    })();
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
        // v2.88.0 O1：成本账（`injectBudget.costView` 的真消费方）。
        //   本轮之前「注入花了多少毫秒」在面板上无处可见——用户只看得见 token 花在谁身上，
        //   看不见时间花在谁身上。两笔账必须并排才叫透明。
        //   「一个引擎源都没量到」不写成「很快」：那说明成本面根本没工作。
        const cv = (WA.injectBudget && WA.injectBudget.costView) ? WA.injectBudget.costView(b.cost) : null;
        if (cv && cv.planned && cv.measured) {
          const bits = ['耗时 ' + cv.totalMs + 'ms', cv.measured + ' 源'];
          if (cv.subTick) bits.push(cv.subTick + ' 源低于 1ms');
          if (cv.slowest) bits.push('最慢 ' + cv.slowest.source + ' ' + cv.slowest.ms + 'ms');
          h += '<div class="wa-dim">' + esc(bits.join('｜')) + '</div>';
          const accs = Object.keys(cv.accounts || {}).map(function (k) { return { k: k, v: cv.accounts[k] }; })
            .filter(function (x) { return x.v.measured; }).sort(function (a, c) { return c.v.ms - a.v.ms; });
          if (accs.length) {
            h += '<div class="wa-dim">科目 ' + accs.map(function (x) { return esc(x.k + ' ' + x.v.ms + 'ms/' + x.v.measured); }).join('｜') + '</div>';
          }
          if ((cv.unclassified || []).length) {
            h += '<div class="wa-dim wa-log-warn">科目表缺登记：' + cv.unclassified.map(function (x) { return esc(x); }).join('、') + '</div>';
          }
        } else if (cv && cv.planned) {
          h += '<div class="wa-dim">本轮无引擎源可计（' + cv.unmeasuredCount + ' 项非计量）</div>';
        }
        // v2.123.0 P3：**局部重算观测面**（`injectBudget.incrementalCost` 的真消费方）。
        //   成本账答的是「这一轮的时间花在谁身上」，它答不出「这轮有几个源是白跑的」——
        //   而「跳过」这个读数此前在库里根本不存在（全部源每轮重建，跳过与否无从判定）。
        //   本块只报本账自己看得见的那一半：
        //     · 真算过哪些源 —— 取自**现场耗时台账**（唯一引擎调用出口落表，46 处调用点全覆盖）；
        //     · 跳过了哪些源 —— 源面求差（`known − touched`）；
        //     · 世界哪几个顶层键本轮变脏 —— 键级指纹对上次采样比对。
        //   **复用读数缺席就如实说缺席**（`reuseKind:'absent'`）：那条读数要真跑四个面
        //   （含重量级诊断采集），它的家是「增量面」按钮 —— 面板不拿空数组冒充「一次都没复用」。
        const rc = li.recalc || null;
        if (rc) {
          h += '<div class="wa-kv"><span>局部重算</span><b>重算 ' + esc(String(rc.touchedCount)) + ' 源 / 跳过 '
            + esc(String(rc.untouchedCount)) + ' 源<span class="wa-dim">（源面 ' + esc(String(rc.knownCount)) + '）</span></b></div>';
          const dk = rc.dirtyKeys || [];
          const reuseTxt = (rc.reuseKind === 'reported')
            ? '复用 ' + (rc.reused || []).length + ' / 重算 ' + (rc.recomputed || []).length
            : '缺席（须真跑四面的读数走「增量面」按钮，不挂进每轮注入链）';
          h += '<div class="wa-dim">脏键 ' + (dk.length ? esc(dk.join('、')) : '无')
            + '（' + esc(rc.dirtyKind || '?') + (rc.rev != null ? '，rev ' + esc(String(rc.rev)) : '') + '）'
            + '｜复用读数 ' + (((!rc.reuseKind || rc.reuseKind === 'absent')) ? esc(reuseTxt) : reuseTxt)
            + (rc.unrecognized && rc.unrecognized.length ? '｜未识别源 ' + esc(rc.unrecognized.join('、')) : '')
            + '</div>';
        }
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
    out += '<div data-omniscient><div class="wa-sec">注入自检</div><div class="wa-sec">注入价值评估</div>'
      + '<div class="wa-sec">注入价值评估（纯只读：关掉之后读数恒空，不是「都没用上」）</div>'
      + '<div class="wa-row"><button class="wa-btn" id="wa-inj-refresh" title="重新读取当前注入快照（只读，不改变任何状态）">刷新快照</button>'
      + '<button class="wa-btn" id="wa-inj-explain" title="本轮为何这样：只报“进了什么”与“还有几项没进”（玩家视图）；逐项原因属制作者视图">本轮解释</button>'
      + '<button class="wa-btn" id="wa-inj-explain-all" title="逐源列名 + 归因码（可见性关 / 模块缺席 / 构建失败 / 本轮无内容），供制作者定位">全知面明细</button>'
      + '<button class="wa-btn" id="wa-inj-face" title="开关两面真值：只报「可见性勾着、模块总开关却关着」的源——那些源本轮一个字节都进不来">开关两面</button>'
      + '<button class="wa-btn" id="wa-inj-diag" title="跳转工具页运行完整自检">去自检</button></div>'
      + '<div id="wa-inj-out" class="wa-out"></div>'
      // v2.150.0(RP4): 注入价值段 —— 「预算告诉你花掉了，价值告诉你有没有白花」。
      //   三条口径必须写在用户看得见的地方，否则这张榜单会被读成「AI 觉得这个源不好」：
      //     ① 引用率 ≠ 采纳率（提到了不等于这笔状态被吸收）；② 跨源通用片段不算数
      //     （每条源都有的句子命中了也说明不了任何关于这个源的事）；③ 算不出来 ≠ 算出来是 0。
      + '<div class="wa-sec">注入价值<span class="wa-dim">（注入进去的东西有没有被正文用上）</span></div>'
      + '<div class="wa-dim">只读评估：它不改注入、不改世界、不评判生成质量。排序按 <b>排除跨源通用片段后的引用率</b>升序 —— 最没用的排在最前（这张表是给「处置」用的，不是给「表彰」用的）。连击指「最近连续 N 轮一次都没被引用」。</div>'
      + '<div class="wa-row"><button class="wa-btn" id="wa-iv-refresh" title="按当前台账重算榜单（只读，不改变任何状态）">刷新榜单</button></div>'
      + '<label class="wa-row"><input id="wa-iv-enabled" type="checkbox" ' + (ivCfg.enabled ? 'checked' : '') + '/> 启用注入价值评估（纯只读：关掉之后读数恒空，不是「都没用上」）</label>'
      + '<div class="wa-row"><input id="wa-iv-zero" class="wa-input wa-num" value="' + ivCfg.zeroRefRounds + '" aria-label="零引用连击阈值"/> 连续零引用阈值（1–20 轮）'
      + '<input id="wa-iv-max" class="wa-input wa-num" value="' + ivCfg.maxKeys + '" aria-label="每源片段上限"/> 每源片段上限（4–48）</div>'
      + '</div>';   // v2.149.0（P3）：注入自检段（制作者面）的 data-omniscient 收口
    return out;
  }


  // ── v2.149.0（X1）：世界沉积层 ─────────────────────────────────────────
  //   治的病：「这地方发生过什么」在引擎里只有一张**当下**的事实表（worldFacts），
  //   事实一旦过期就什么都不剩 —— 玩家走过一条街，看不出这里打过仗、这里死过人、
  //   这里曾经是刑场。本模块让地点**自己记得**：痕迹按档沉积（隐约可见 / 清晰可辨 /
  //   遍地残骸），随时间**只降档、不消失**（降到传说档即永驻）。
  //
  //   面板三条纪律（与既有各模块同款）：
  //     · 总开关走模块自己的 settings（worldaxis_sediment_settings_v1）。关闭时
  //       不记录、不注入 —— 但既有痕迹仍在存档里：「不再注入」与「抹掉了历史」是两件事。
  //     · 每条读数的**拒绝理由**必须看得见：缺地点 / 缺键 / 痕迹档表外 —— 三个码分开报。
  //       合成一个「没记上」之后，用户答不出是没填地点、没填键，还是档位写错了。
  //     · 只读出口（读此地 / 台账 / 块预览）不写任何状态；「登记」是本模块唯一的写口。
  function renderSediment() {
    const cfg = (WA.sediment && WA.sediment.getSettings) ? WA.sediment.getSettings() : null;
    const en = !!(cfg && cfg.enabled);
    const traces = (WA.sediment && WA.sediment.TRACES) || ['minor', 'marked', 'scar'];
    const labels = (WA.sediment && WA.sediment.LABEL) || {};
    const opt = function (t) {
      return '<option value="' + t + '"' + (t === 'marked' ? ' selected' : '') + '>' + esc(labels[t] || t) + '</option>';
    };
    return `
      <div class="wa-sec">世界沉积层（此地的历史痕迹）</div>
      <div class="wa-dim">痕迹是「这个地方发生过什么」，不是「谁此刻在场」。三档 <b>隐约可见 / 清晰可辨 / 遍地残骸</b>，
        随时间只降档、<b>不消失</b>（降到传说档即永驻）——「这里曾经遍地残骸」是事实，不因为后来有人扫了地就假装没发生过。</div>
      <label class="wa-row"><input id="wa-sed-enabled" type="checkbox" ${en ? 'checked' : ''}/> 启用世界沉积层</label>
      <div class="wa-row"><input id="wa-sed-place" class="wa-input" placeholder="地点（不填 = 此刻所在的场景）"/><select id="wa-sed-trace" class="wa-input wa-w60" aria-label="痕迹档（隐约可见/清晰可辨/遍地残骸）">${traces.map(opt).join('')}</select></div>
      <div class="wa-row"><input id="wa-sed-key" class="wa-input" placeholder="事实键（同一地点同一键只记一次）"/><input id="wa-sed-text" class="wa-input" placeholder="痕迹描述（如「墙根下还留着弹孔」）"/></div>
      <div class="wa-row"><button class="wa-btn" id="wa-sed-settle" title="登记一条痕迹。**这是本模块唯一的写口** —— 痕迹只能被登记，不能被推断。同一地点同一键重复登记只刷新痕迹与时间，且痕迹**只升不降**（后来者不许把「遍地残骸」降回「隐约可见」）">登记痕迹</button><button class="wa-btn" id="wa-sed-feel" title="读此地（只读）：列出此处全部痕迹与**当前**档位。衰减是现算的、不写回字段 —— 写回即第二真源。查不到就说查不到，不回落成「这里什么都没有发生过」">读此地</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-sed-block" title="注入块预览（只读）：把此刻会递进正文的那一段原样打出来。传说档不进块（它已是最久远的底噪，再占预算就挤掉了近事）">注入块预览</button><button class="wa-btn" id="wa-sed-stat" title="只读：沉积台账（几处地方 / 几条痕迹 / 几条已降到传说档 / 三容器上限）。空集如实报 0，不编造">台账读数</button></div>
      <div id="wa-sed-out" class="wa-out"></div>`;
}

  /**
   * v2.151.0（RX2+RX3）：跨会话记忆锚 + 远方世界脉搏。五条口径（全是本仓反复付过价的那几条）：
   *   · 控件必须「渲染 + 绑定 + 守卫登记」三件齐做，否则「按钮渲染了但绑定的 id 写错」
   *     这类断裂在新出口上无人发现（UI_BINDINGS 是接线面的唯一真源）。
   *   · wa-ot-out 是输出区（与 wa-sed-out / wa-noe-out 同规格：面板回显，不是控件），仍登记。
   *   · 「报错」与「空结果」分开：空结果不当红色错误报，而按真实局面说明为何是空。
   *   · 两类读数**不合并**：「你不在这段时间」与「你不在的地方」是两件事 ——
   *     合成一页、共用一栏输出，但各有各的台账与各有各的开关（口径不合并）。
   *   · 本页写口与读口并存：开关/登记/结算写，清单/摘要/台账只读，逐枚在 title 里标明。
   */
  function renderOffline() {
    const cfg = (WA.offlineTick && WA.offlineTick.getSettings) ? WA.offlineTick.getSettings() : null;
    const en = !!(cfg && cfg.enabled);
    const kinds = (WA.offlineTick && WA.offlineTick.KINDS) || ['task', 'pact', 'feud'];
    const labels = (WA.offlineTick && WA.offlineTick.KIND_LABEL) || {};
    const opt = function (k) {
      return '<option value="' + k + '"' + (k === 'task' ? ' selected' : '') + '>' + esc(labels[k] || k) + '</option>';
    };
    // v2.156.0（SP1/S1）：同 rpcfg/sfcfg 的理由 ——「读数是空的」与「这一类被关掉了」在界面上本是两件事。
    const ptcfg = (WA.playtime && WA.playtime.getSettings) ? WA.playtime.getSettings() : null;
    const orcfg = (WA.offlineReturn && WA.offlineReturn.getSettings) ? WA.offlineReturn.getSettings() : null;
    const fcfg = (WA.farfield && WA.farfield.getSettings) ? WA.farfield.getSettings() : null;
    // v2.152.0（RP6）：渲染观测面的**设置读数**。为什么它必须是产品消费方：
    //   「读数一直是空的」与「观测被关掉了」在界面上本是两件事，只看输出区是不可分的。
    //   所以这里把 enabled 摆到段落说明里——控制台里手调一次不算接线，用户要能看见。
    const rpcfg = (WA.renderPerf && WA.renderPerf.getSettings) ? WA.renderPerf.getSettings() : null;
    const sfcfg = (WA.storageForecast && WA.storageForecast.getSettings) ? WA.storageForecast.getSettings() : null;
    // v2.153.0（RX5/RX6）：同 rpcfg/sfcfg 的理由 ——「读数是空的」与「这一类被关掉了」在界面上本是两件事。
    const pgcfg = (WA.plotGauge && WA.plotGauge.getSettings) ? WA.plotGauge.getSettings() : null;
    const btcfg = (WA.branchTree && WA.branchTree.getSettings) ? WA.branchTree.getSettings() : null;
    return `
      <div class="wa-sec">跨会话记忆锚（你不在的这段时间）</div>
      <div class="wa-dim">锚是「这条线是玩家推出来的」的声明，<b>不是锁</b>：它不冻结任何数值，只对离线这一批负责 ——
        离线推演不许覆盖它；遇到与锚相抵的改动一律记为跳过（不回滚：回滚会把同一轮里无关的好改动一起撤掉）。</div>
      <label class="wa-row"><input id="wa-ot-enabled" type="checkbox" ${en ? 'checked' : ''}/> 启用跨会话记忆锚</label>
      <div class="wa-row"><input id="wa-ot-path" class="wa-input" placeholder="路径（如 people.p1.life / worldFacts）"/><select id="wa-ot-kind" class="wa-input wa-w60" aria-label="锚类别">${kinds.map(opt).join('')}</select></div>
      <div class="wa-row"><input id="wa-ot-note" class="wa-input" placeholder="备注（如「找回了姐姐」）"/><button class="wa-btn" id="wa-ot-anchor" title="登记一条锚（同路径幂等：只刷新文本与时间，不重复入账）">登记锚</button><button class="wa-btn" id="wa-ot-anchors" title="只读：当前在场（未释放）的锚路径清单">锚清单</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-ot-release" title="释放一条锚（破坏性，故必须显式）：世界真的变了——任务被推翻、同盟破裂。不删行，行保留为已释放（「曾经锚过」是复盘材料）">释放锚</button><button class="wa-btn" id="wa-ot-tick" title="按世界钟离线时长结一轮（步长与轮数上限由设置决定）。首调只落基准——「不知道你走了多久」不等于「你走了零秒」">结算离线时长</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-ot-summary" title="只读：最近一批的「你不在时发生了什么」摘要">摘要</button><button class="wa-btn" id="wa-ot-block" title="注入块预览（只读）：把此刻会递进正文的那一段原样打出来">注入块</button><button class="wa-btn" id="wa-ot-stat" title="只读：锚/批次/跳过三环与上限读数">台账</button></div>
      <div class="wa-sec">远方世界脉搏（你不在的地方）</div>
      <div class="wa-dim">近场（<b>玩家所在</b>）与远场（其他地方）分开：远场有自己简化的持续状态（只记大势，不记人名与明细），
        纯规则驱动 —— <b>不消耗 AI</b>。消息按距离延迟渗入近场，且转述会失真（「原话」与「听说的」不是一回事）。</div>
      <label class="wa-row"><input id="wa-ff-enabled" type="checkbox" ${(fcfg && fcfg.enabled) ? 'checked' : ''}/> 启用远方世界脉搏</label>
      <div class="wa-row"><button class="wa-btn" id="wa-ff-partition" title="只读：按距离切近/远场。划分线以 region.places() 为单一真源（本模块不另存一份地区表）">分区</button><button class="wa-btn" id="wa-ff-pending" title="只读：在途传闻（未到期的必须在这里看得见 ——「在路上」不是「没发生」）">在途</button><button class="wa-btn" id="wa-ff-stat" title="只读：远方大事记/在途/已传到近场三环与上限读数（含四类上限：推演/窗口预算/在途/转移包）">台账</button></div>
      <div class="wa-dim">v2.157.0 四类上限<b>分列</b>（它们此前挤在一个数字上）：「一次推几窗」（推演上限）／
        「窗口预算」（同时也是大事记环长）／「在途能装几条」（满即<b>暂停接新批次</b>，不静默挤掉没到的信）／
        「一次转移包几条」（<b>整批交付或整批拒收</b>，不做部分交付）。</div>
      <label class="wa-row"><input id="wa-ff-auto" type="checkbox" ${(fcfg && fcfg.auto) ? 'checked' : ''}/> 按剧情时间自动推进远方</label>
      <div class="wa-row"><button class="wa-btn" id="wa-ff-tick" title="写口：按当前剧情日推进一次（读 playtime.story().dayIndex，窗口数由「剧情日走了几日」决定；零时间/倒退/重放一窗不推）">按剧情日推一次</button><button class="wa-btn" id="wa-ff-transfer" title="只读：把已传到近场的消息打成一个转移包（整批或拒收，超容量报 too-many）">转移包</button></div>
      <div id="wa-ff-out" class="wa-out"></div>
      <div id="wa-ot-out" class="wa-out"></div>
      <div class="wa-sec">游玩活动基准与时间来源（v2.156.0）</div>
      <div class="wa-dim">四种时间各有各的读法，<b>不合并</b>：墙钟（测量）／决策时间（可复现，回放冻结的是这一条）／
        剧情时间（正文世界钟，<b>缺失即拒算</b>——不拿真实时间顶替）／真实活动基准（每聊天「上次有效活动」）。</div>
      <div class="wa-dim">活动基准的价值是一句话：<b>「不知道你走了多久」与「你走了零秒」必须可分</b>。
        它是进程侧记忆（刻意不进世界存档），且<b>读取不改基准</b>——只有「更新基准」会推进它
        （先读后写是恢复编排的纪律：先刷新基准会把离线间隔抹掉）。</div>
      <div class="wa-dim">活动基准此刻：<b>${(ptcfg && ptcfg.enabled) ? '开' : '关'}</b>（关闭时写入被拒收，读数会一直空——这与「本聊天还没活动过」不是一回事）。</div>
      <label class="wa-row"><input id="wa-pt-enabled" type="checkbox" ${(ptcfg && ptcfg.enabled) ? 'checked' : ''}/> 启用游玩活动基准</label>
      <div class="wa-row"><button class="wa-btn" id="wa-pt-read" title="只读：读回本聊天的活动基准（**不改基准**）。「从没记过」与「存储读不出来」在这里分列">读基准</button><button class="wa-btn" id="wa-pt-touch" title="写口：更新本聊天的活动基准（显式动作，绕过节流——节流是给自动调用方的有界频率，不是给按钮的）">更新基准</button></div>
      <div class="wa-sec">离线恢复编排（v2.156.0）</div>
      <div class="wa-dim">玩家离开的这段真实时间，<b>由谁去结算</b>与<b>结算成什么</b>是两件事：本段管前者 ——
        它读活动基准、按配置恢复一轮离线推演，并把「你不在时」的摘要交给注入链。默认<b>关</b>
        （它会写世界，本仓对写入型模块一律默认关）。失败不假装：拒收码逐条如实报，
        重试沿用同一条随机磁带——重试不该再掷一次骰子。</div>
      <div class="wa-dim">恢复编排此刻：<b>${(orcfg && orcfg.enabled) ? '开' : '关'}</b>（关闭时不自动恢复，手动按钮仍可显式跑一次）。</div>
      <label class="wa-row"><input id="wa-or-enabled" type="checkbox" ${(orcfg && orcfg.enabled) ? 'checked' : ''}/> 启用离线恢复编排</label>
      <div class="wa-row"><button class="wa-btn" id="wa-or-recover" title="按当前活动基准恢复一轮（先读后写：基准在恢复前先取快照，否则刷新基准会把离线间隔抹掉）">恢复一轮</button><button class="wa-btn" id="wa-or-stat" title="只读：恢复/跳过/失败三环与票据复核读数">台账</button></div>
      <div id="wa-or-out" class="wa-out"></div>
      <div class="wa-sec">性能与水位（v2.152.0）</div>
      <div class="wa-dim">两条观测链分列：面板渲染链（切页/重绘的耗时与 DOM 规模）与存储水位（按增速外推多少轮后到达配额档位）。
        都是<b>只读观测</b>——不做增量优化、不自动清理（发现劣化的是读数，改配置的是人）。
        渲染观测此刻：<b>${(rpcfg && rpcfg.enabled) ? '开' : '关'}</b>（关闭时不记任何一次重绘，读数会一直空——这与「还没切过页」不是一回事）。</div>
      <div class="wa-sec">记录面板渲染读数（v2.152.0）</div>
      <label class="wa-row"><input id="wa-rp-enabled" type="checkbox" ${(rpcfg && rpcfg.enabled) ? 'checked' : ''}/> 记录面板渲染读数</label>
      <div class="wa-row"><button class="wa-btn" id="wa-rp-stat" title="只读：逐页渲染读数（次数/平均耗时/平均节点数/最近耗时）">渲染读数</button><button class="wa-btn" id="wa-rp-trend" title="只读：三基准均值对照（近10/近50/全窗）">渲染趋势</button><button class="wa-btn" id="wa-rp-reset" title="清空两条观测链的内存环（渲染样本环 + 存储样本环）。只清进程态读数，不动存档、不改配置——「重新量一遍」与「抹掉证据」是两件事，故此处只清前者">清空观测</button></div>
      <div class="wa-sec">存储水位预测（v2.152.0）</div>
      <label class="wa-row"><input id="wa-sf-enabled" type="checkbox" ${(sfcfg && sfcfg.enabled) ? 'checked' : ''}/> 启用存储水位预测</label>
      <div class="wa-row"><button class="wa-btn" id="wa-sf-sample" title="采一次当前总字节样本（每轮结算后由调用方采，此处手动补采）">采样本</button><button class="wa-btn" id="wa-sf-forecast" title="只读：按最小二乘外推到达 50%/75%/90%/100% 配额的轮数">水位预测</button><button class="wa-btn" id="wa-sf-stat" title="只读：样本环与拒收归因读数">台账</button></div>
      <div id="wa-rp-out" class="wa-out"></div>
      <div class="wa-sec">剧情深度与分支树（v2.153.0）</div>
      <div class="wa-dim">两条只读面。<b>张力指数</b>是四分量加权合成（悬念存量 30／推进动能 30／暗流成熟 25／到期压力 15），
        分量缺席时**该分量与它的权重一并剔除**、按在场权重归一 ——「没有线程」是<b>无从判定</b>，不是「暗流全不成熟」（算 0 分就是把后者伪装成前者）。
        <b>分支树</b>记的是玩家**实际做过**的选择；回放用的是当时那次预演钉下的那份世界指纹，世界变了就如实说不可回放。
        两条都不写世界：不自动收线、不自动推进、**零自动登记**。</div>
      <div class="wa-sec">剧情深度仪（v2.153.0）</div>
      <label class="wa-row"><input id="wa-pg-enabled" type="checkbox" ${(pgcfg && pgcfg.enabled) ? 'checked' : ''}/> 启用剧情深度仪</label>
      <div class="wa-row"><button class="wa-btn" id="wa-pg-read" title="只读：张力指数与四个分量（分量各自可读 —— 合成值失真的第一诊断手段就是「看哪个分量在动」）">张力读数</button><button class="wa-btn" id="wa-pg-trend" title="只读：走向（末 3 次比较方向一致才算连续）。两个点连不成趋势，不足 3 点如实说">走向</button><button class="wa-btn" id="wa-pg-advice" title="只读：收线建议（不是剧情建议）—— 每条都带它自己读到的数">收线建议</button><button class="wa-btn" id="wa-pg-stat">台账</button></div>
      <div class="wa-row"><input id="wa-bt-round" class="wa-input" placeholder="第几轮（如 12）"/><input id="wa-bt-prompt" class="wa-input" placeholder="面对什么（如「要不要说出真相」）"/><input id="wa-bt-opts" class="wa-input" placeholder="走法（逗号分隔，至少两条）"/><button class="wa-btn" id="wa-bt-fork" title="写口：登记一个分叉点。零自动登记 —— 谁在哪个点分叉由调用方决定（自动判断『这是重大选择』需要叙事判断，本模块不替模型做这件事）。走法不足两条拒收 no-options：一条走法的「选择」是流水账，不是分叉">登记分叉点</button></div>
      <div class="wa-row"><input id="wa-bt-id" class="wa-input" placeholder="分叉点 id"/><input id="wa-bt-choice" class="wa-input" placeholder="实际选了哪条（须在登记表内）"/><button class="wa-btn" id="wa-bt-choose" title="写口：记录实际选择（只补一格，不新增节点）。选了登记表以外的走法一律拒收 bad-value —— 不悄悄追加，否则「我登记了三条、实际走了第四条」在树上长得像正常分支">记录选择</button><button class="wa-btn" id="wa-bt-replay" title="写口（只读语义）：回放某点的预演结论。世界已变即如实报 not-comparable —— 不拿一个旧结论冒充可以回放">回放</button></div>
      <div class="wa-sec">多结局分支树（v2.153.0）</div>
      <label class="wa-row"><input id="wa-bt-enabled" type="checkbox" ${(btcfg && btcfg.enabled) ? 'checked' : ''}/> 启用多结局分支树</label>
      <div class="wa-row"><button class="wa-btn" id="wa-bt-tree" title="只读：分支树 JSON（节点 = 分叉点，边 = 选择）。只给 JSON，不做图形渲染">分支树</button><button class="wa-btn" id="wa-bt-compare" title="只读：两个分叉点的可比性对比。缺指纹是 unknown（没得比），不是 diff（比出来不一样）">比对两点</button><button class="wa-btn" id="wa-bt-nodes" title="只读：分叉点清单（含各自有没有预览、选了哪条）">节点清单</button><input id="wa-bt-a" class="wa-input" placeholder="基点 id"/><input id="wa-bt-b" class="wa-input" placeholder="另一点 id"/></div>
      <div id="wa-pg-out" class="wa-out"></div>`;
  }

  // ===== v2.154.0（RX4 世界联网面 + RX7 生态自洽审计）=====
  // 设计动机（两张面摆上界面）：
  //   · RX4 世界联网面：一个世界产生的大事要能被**别的世界**知道。但「知道」在本仓里有三条
  //     互不相同的路径，本页把三条**分开摆**（合成一个按钮就是把三件事说成一件事）：
  //       导出 = 从本世界编年史取三类大事、逐句脱敏后打包 —— **纯读**，不改任何状态；
  //       导入 = 把别处来的包以「听说的」身份存进传说链 —— 唯一写入口，且只写传说；
  //       转投 = 显式把某条传说落成一条世界事实、再起 rumor 链（两步独立事务，理由见引擎注释）。
  //     三条分工不合并：传说直接写成世界事实，下一轮它就变成「这里发生过的事」。
  //   · RX7 生态自洽审计：时间线/空间/认知/因果四类**跨模块**一致性，只报不改 ——
  //     面板只呈现，不自动修复（自动改架空的正是「世界为什么自洽」这件事本身）。
  //   两段共用一句纪律：「读数是空的」与「这一面被关掉了」在界面上必须可分辨。
  function renderNet() {
    const nbcfg = (WA.worldBridge && WA.worldBridge.getSettings) ? WA.worldBridge.getSettings() : null;
    const eccfg = (WA.ecoAudit && WA.ecoAudit.getSettings) ? WA.ecoAudit.getSettings() : null;
    const nbOn = !!(nbcfg && nbcfg.enabled);
    const ecOn = !!(eccfg && eccfg.enabled);
    const on = function (v) { return v ? 'checked' : ''; };
    return `
      <div class="wa-sec">世界联网面（别人家的大事传到这里）</div>
      <div class="wa-dim">世界身份 = <b>(世界观 ID + 玩家 ID)</b> 两段派生哈希合成 ——
        半份身份一律不成签名（拿半份身份去判「是不是同一个世界」是假判据，故这里如实说缺哪一半）。
        传说只有三种走法：<b>导出</b>（编年史三类大事逐句脱敏后打包，纯读）、
        <b>导入</b>（别处的包以「听说的」身份进传说链，唯一写入口）、
        <b>转投 rumor</b>（显式落一条世界事实再起链）。<b>传说不写世界事实</b> ——
        写了它就变成「这里发生过的事」，模型下一轮会照着它推本地人物的行动。
        联网面此刻：<b>${nbOn ? '开' : '关'}</b>（关闭时导出/导入/转投三处一并拒收，读数会一直空 ——
        这与「还没传过」不是一回事）。</div>
      <label class="wa-row"><input id="wa-nb-enabled" type="checkbox" ${on(nbOn)}/> 启用世界联网面</label>
      <div class="wa-row"><input id="wa-nb-title" class="wa-input" placeholder="世界观 ID（留空回落宿主角色名）" value="${esc(nbcfg ? nbcfg.worldTitle : '')}"/><input id="wa-nb-player" class="wa-input" placeholder="玩家 ID（留空回落宿主 name1）" value="${esc(nbcfg ? nbcfg.playerName : '')}"/><button class="wa-btn" id="wa-nb-ident" title="保存两段身份（世界签名的输入；改身份会改变签名，故是显式写动作）">保存身份</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-nb-key" title="只读：世界签名（两段派生值 + 合成哈希 + 缺哪一半）">世界签名</button><button class="wa-btn" id="wa-nb-seed" title="把当前身份与计数记进本世界的联网档案（幂等：同签名重复只累加计数）">落种子</button><button class="wa-btn" id="wa-nb-export" title="纯读：从编年史取「大战/大案/大人物崛起」三类，逐句脱敏后打包。脱敏剔了几句随读数给出；脱敏后什么都不剩的整条剔除（不导出空传说）">导出传说</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-nb-import" title="唯一写入口：把别处来的传说包以「听说的」身份存进传说链。同签名 = 本世界自己的回灌，硬拒收（「拒收」不是「导入了 0 条」）；档位写错的行逐条剔除并如实报数">导入传说</button><input id="wa-nb-pack" class="wa-input" placeholder="传说包 JSON（留空则用本页上一次导出的包）"/><button class="wa-btn" id="wa-nb-legends" title="只读：收进来的传说清单（逐条标明来自哪个世界、已传开几次）">传说清单</button></div>
      <div class="wa-row"><input id="wa-nb-lg" class="wa-input" placeholder="传说 id（如 lg_1a2b3c4d_5e6f7a8b）"/><button class="wa-btn" id="wa-nb-relay" title="把这条传说落成一条世界事实、再起 rumor 链（两步独立事务）。为什么不自动转交：rumor 的链只能挂在已存在的事实键上（unknown-fact 是硬拒收），不落事实而直接起链，唯一结果是它永远传不出去；链没起成时**事实不回滚**（它确实被记下了，删掉就是篡改）">转投 rumor</button><button class="wa-btn" id="wa-nb-block" title="只读：注入块预览（只念收进来的传说，逐条标「来自别处」—— 没有这条标注，模型会把听说的远方事当成本地既成事实写下去）">注入块</button><button class="wa-btn" id="wa-nb-stat" title="只读：传说/已导入签名/种子三环与上限、导出脱敏与拒收归因">台账</button></div>
      <div id="wa-nb-out" class="wa-out"></div>
      <div class="wa-sec">世界生态自洽审计（v2.154.0）</div>
      <div class="wa-dim">四类跨模块一致性，<b>只报不改</b>：<b>时间线</b>（排期倒挂 / 引用未来的事）、
        <b>空间</b>（同一人同时出现在两处）、<b>认知</b>（知道了他不该知道的事 —— 判据以 rumor.visibleTo 为单一真源，
        缺席时如实回落到 local-hops 并标出来）、<b>因果</b>（原因不成立 / 无因之果）。
        审计器**不参与修复**：自动改架空的正是「世界为什么自洽」这件事本身。审计器自身耗时进性能台账。
        此刻：<b>${ecOn ? '开' : '关'}</b>（关闭时不扫，读数会一直空 —— 这与「扫过没问题」不是一回事）。</div>
      <label class="wa-row"><input id="wa-ec-enabled" type="checkbox" ${on(ecOn)}/> 启用世界生态自洽审计</label>
      <div class="wa-row"><label><input id="wa-ec-tl" type="checkbox" ${on(eccfg && eccfg.timelineEnabled)}/> 时间线</label><label><input id="wa-ec-sp" type="checkbox" ${on(eccfg && eccfg.spaceEnabled)}/> 空间</label><label><input id="wa-ec-cog" type="checkbox" ${on(eccfg && eccfg.cognitionEnabled)}/> 认知</label><label><input id="wa-ec-cau" type="checkbox" ${on(eccfg && eccfg.causalEnabled)}/> 因果</label><button class="wa-btn" id="wa-ec-save" title="保存四类开关（关掉的那一类不进本次扫描，读数里如实标 off —— 不拿「没扫」冒充「没问题」）">保存类别</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-ec-sweep" title="扫一遍（唯一真入口：面板与常规巡视读的是同一份读数，不另立两套判据）">扫描</button><button class="wa-btn" id="wa-ec-issues" title="只读：上一次的问题清单（逐条带码、类别、级别与两个读数）。行数被上限截断时如实报「还有多少条没列出来」">问题清单</button><button class="wa-btn" id="wa-ec-last" title="只读：上一次扫描读数（四类开关状态/判据来源/截断数/没做成的小节）。从未扫过报 never-swept —— 不拿 0 条冒充「干净」">上次读数</button><button class="wa-btn" id="wa-ec-stat" title="只读：扫描次数/问题累计/按码按类分布/降级小节">台账</button></div>
      <div id="wa-ec-out" class="wa-out"></div>`;
  }

  function renderDirector() {
    const vis = WA.render.getVisibility();
    const plan = WA.oracle.plan;
    const activeThemes = (WA.theme && typeof WA.theme.statView === 'function') ? (WA.theme.statView().themes || []) : [];
    // v2.149.0（P3）：导演页整页是**制作者面**（注入可见性枚举、题材组合、剧情引导、
    //   AI 参谋、因果工作台、磁带仓库）—— 没有一件是「玩家该看到的」。整页挂在
    //   一个 data-omniscient 容器下，玩家视角下整页摘除（而不是逐控件标记 60 次：
    //   逐控件标记的失效模式是「新增控件时忘了标记」，而整页标记的失效模式是零）。
    return `<div data-omniscient>
      <div class="wa-sec">注入可见性（哪些世界信息递给正文）</div>
      ${WA.render.SOURCES.map(k => `<label class="wa-node"><input type="checkbox" data-vis="${k}" ${vis[k] ? 'checked' : ''}/><span class="wa-node-label">${VIS_NAMES[k] || k}</span></label>`).join('')}
      <div class="wa-sec">题材规则组合（B7）</div>
      <div class="wa-dim">题材是对规则模块的显式组合：多选取并集并按原序；核心模块（世界/事件/知情边界/声誉）永在场。预览不落设置，应用是唯一写入口。</div>
      <div class="wa-row">${(WA.theme ? WA.theme.list() : []).map(x => `<label class="wa-node"><input type="checkbox" class="wa-theme-opt" value="${x.key}" ${activeThemes.indexOf(x.key) >= 0 ? 'checked' : ''}/><span class="wa-node-label">${esc(x.label)}</span></label>`).join('') || '<span class="wa-dim">题材模块未加载</span>'}</div>
      <div class="wa-row"><button class="wa-btn" id="wa-theme-preview">预览差异</button><button class="wa-btn" id="wa-theme-apply" title="唯一写入口：未知题材一律拒收且不改设置">应用题材</button><button class="wa-btn" id="wa-theme-clear" title="清空题材：回到全量注入（旧行为）">清空（回全量）</button></div>
      <div id="wa-theme-out" class="wa-out">${(() => {
        const ts = (WA.theme && typeof WA.theme.statView === 'function') ? WA.theme.statView() : null;
        if (!ts) return '';
        return '<span class="wa-dim">当前启用：' + (ts.themes.length ? esc(ts.themes.join('+')) : '无（全量 ' + (((WA.rules && WA.rules.ORDER) || []).length) + ' 模块）')
          + ' · 应用 ' + ts.applies + ' 次 / 预览 ' + ts.previews + ' 次 / 拒收 ' + ts.rejects + ' 次</span>';
      })()}</div>
      <div class="wa-sec">剧情引导（弧线/序列）</div>
      ${plan ? `<div class="wa-item"><b>${esc(plan.kind === 'arc' ? '弧线' : '序列')}</b> 第${plan.current + 1}/${plan.beats.length}拍<div class="wa-dim">${esc((WA.oracle.currentBeat() || {}).goal || '')}</div><button class="wa-btn wa-mini" id="wa-beat-next" title="推进到剧情弧线的下一拍">完成本拍</button><button class="wa-btn wa-mini" id="wa-plan-clear">放弃</button></div>`
        : `<textarea id="wa-plan-beats" class="wa-ta" placeholder="每行一拍的目标/指令…"></textarea><button class="wa-btn" id="wa-plan-start">开始序列引导</button>`}
      <div class="wa-sec">AI 剧情参谋（judge 通道）</div>
      <div class="wa-row"><input id="wa-or-goal" class="wa-input" placeholder="剧情目标（如「揭开蒙面人身份」）…"/><input id="wa-or-beats" aria-label="节拍数" class="wa-input wa-num" type="number" min="1" max="12" value="5"/></div>
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
      <div class="wa-sec">因果工作台（B6）</div>
      <div class="wa-row"><button class="wa-btn" id="wa-cw-view" title="当前存档与本次进程累计分列——一个答「现在是怎样」，一个答「这一轮发生了几次」">当前/累计</button><button class="wa-btn" id="wa-cw-rehearse" title="在深拷贝上跑一整轮推进：看会发生什么，但不改存档、不留痕迹">分支试演</button><button class="wa-btn" id="wa-cw-conflicts" title="报出同因同果的重复链——只报不消解，消解由你显式选择">查冲突</button><button class="wa-btn" id="wa-cw-evidence" title="这一轮推进凭什么：随机源读数与推进绑定，不可复现时必须照实说">回放证据</button><button class="wa-btn" id="wa-cw-record" title="录制一轮推进：把这一轮抽取到的随机答案按顺序记成一卷磁带——录制之后的「复核磁带」与「回放」才有东西可查">录制一轮</button><button class="wa-btn" id="wa-cw-verify" title="从种子重算最近一卷磁带（纯算术、零副作用）：证「这卷磁带确实出自这个种子」；与「回放」是两条不同的证据">复核磁带</button></div>
      <div class="wa-row"><input id="wa-cw-id" class="wa-input" placeholder="链 id"/><input id="wa-cw-act" class="wa-input" placeholder="动作 advance/cancel/settle"/><button class="wa-btn" id="wa-cw-intervene" title="先预览「做这个动作会变成什么」，允许与否都给原因码，零副作用">干预预览</button></div>
      <div class="wa-row">      <button class="wa-btn" id="wa-cw-vol" title="导出最近一卷磁带（纯读：不丢卷、不清留存、不改计数）——上一节会话那一轮凭什么，只有把它带出去才答得上">导出磁带</button><button class="wa-btn" id="wa-cw-vol-check" title="核对一卷从别处拿来的磁带（值链 + 位置链），零状态触碰：不装卷、不推进、不改当前模式">带外核对</button></div>
      <textarea id="wa-cw-vol-text" class="wa-ta" placeholder="把一卷磁带（JSON）粘在这里再点「带外核对」——上一节会话导出的那种。本侧无卷时照实说「先导出一卷」，不假装核对过"></textarea>
      <div class="wa-sec">磁带仓库（跨会话持久 · 环形 20 卷）</div>
      <div class="wa-row"><button class="wa-btn" id="wa-cw-store-save" title="把导出框里那卷磁带存入仓库（localStorage 持久，跨会话可取回）——保存是显式动作，机制不替你决定哪一卷值得留">存入仓库</button><button class="wa-btn" id="wa-cw-store-list" title="列出仓库里的全部卷（只读）">仓库清单</button><button class="wa-btn" id="wa-cw-store-load" title="按 id 取回一卷还原为可回放磁带对象（纯读，不自动进回放）">按号取回</button><button class="wa-btn" id="wa-cw-store-drop" title="显式删一卷（破坏性，确认后执行）">删除一卷</button></div>
      <input id="wa-cw-store-id" class="wa-input" placeholder="卷 id（如 t1730000000000_1）——取回 / 删除都按这个号"/>
      <div id="wa-cw-store-out" class="wa-out"></div>
      <div id="wa-cw-out" class="wa-out"></div>
      <div id="wa-choices-out" class="wa-out"></div></div>`;
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
    // v2.155.0（RX8 世界种子库）：读数在「工具」页常驻，开关状态进渲染（
    //   「库是空的」与「这一面被关掉了」在界面上必须分得开 —— 与 v2.154.0 同一句纪律）。
    const wscfg = (WA.worldSeed && WA.worldSeed.getSettings) ? WA.worldSeed.getSettings() : null;
    const wsOn = !!(wscfg && wscfg.enabled);
    // v2.164.0（TX5 世界蓝图）：同款读数常驻（「库是空的」与「这一面被关掉了」必须分得开）。
    const bpcfg = (WA.worldBlueprint && WA.worldBlueprint.getSettings) ? WA.worldBlueprint.getSettings() : null;
    const bpOn = !!(bpcfg && bpcfg.enabled);
    return `
      <div class="wa-sec">世界态势分析（纯只读体检）</div>
      <button class="wa-btn" id="wa-an-run">立即分析</button>
      <div id="wa-an-out" class="wa-out"></div>
      <div class="wa-sec">状态快照导出 / 恢复</div>
      <div class="wa-row"><button class="wa-btn" id="wa-snap-dl" title="导全量快照（剔除运行期脏字段，可归档/传给别人/跨聊天移植）">导出 JSON</button><button class="wa-btn" id="wa-snap-up" title="从快照文件恢复（先校验格式/schema/字段完整性，通过才写入）">导入 JSON</button><input type="file" id="wa-snap-file" aria-label="要导入的快照文件" accept=".json" style="display:none"/></div>
      <div class="wa-dim">导出剔除运行时脏字段；导入先校验（格式/schema/字段完整性），通过才写入并自动留恢复点。</div>
      <div class="wa-row"><input id="wa-snap-faces" class="wa-input" placeholder="面名，逗号分隔（如 people,world,weather）"/><button class="wa-btn" id="wa-snap-subset" title="只导出点名的顶层面；不识别的名字进 dropped 清单，不静默带上">导出子集</button></div>
      <div id="wa-snap-out" class="wa-out"></div>
      <div class="wa-sec">外部数据导入（自动识别类型）</div>
      <div class="wa-row"><button class="wa-btn" id="wa-imp-pick">选择 JSON 文件</button><input type="file" id="wa-imp-file" aria-label="要导入的 JSON 文件" accept=".json" style="display:none"/></div>
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
        <button class="wa-btn" id="wa-cfg-view" title="配置包：整包导出/导入设置家族键，含 schema 版本、备份环与失败不污染">配置包</button>
        <button class="wa-btn" id="wa-settle-view" title="结算守卫：同一楼层是否被重复结算">结算守卫</button>
        <button class="wa-btn" id="wa-claim-view" title="异步写回票据：摘要/记忆/档案/舆情的迟到结果被放行还是拒收，以及拒收归因（只看已发生的读数）">写回票据</button>
        <button class="wa-btn" id="wa-compat-view" title="宿主兼容层：当前宿主提供了哪些能力、缺哪些">宿主兼容层</button>
        <button class="wa-btn" id="wa-net-view" title="跨插件互操作：宿主能力 / 上游证据读取 / 手机侧交互执行，三伙伴五态分列（只读，不驱动对方重建快照）">跨插件面</button>
        <button class="wa-btn" id="wa-net-freeze" title="协议冻结面：三座桥的 id 与契约版本、诊断节键、拒收码词表——外部读者认的就是这些字符串">协议冻结面</button>
        <button class="wa-btn" id="wa-perf-view" title="性能面：分层耗时 P50/P95、四个耗时分列、脏集与复用计数（只念已发生的读数，不触发基准）">性能面</button>
        <button class="wa-btn" id="wa-perf-bench" title="基准面：真跑冷启（四面各一遍）与热启（按脏集复用），并复核复用值是否等于现算值">基准面</button>
        <button class="wa-btn" id="wa-perf-partial" title="增量面：按每一面自己的输入（世界步进 stateRev）决定重算还是复用——同一世界步进下重复读取应为 0 重算；改过世界再点则如实重算">增量面</button>
        <button class="wa-btn" id="wa-perf-band" title="档位面：短 / 中 / 长 / lowend 四档并排，本地与宿主 API 分列（每档取本档前后的差值，不是全局累计）；lowend 为同机放大估计，不参与判定">档位面</button>
      </div>
      <div class="wa-sec">审计取证<span class="wa-dim">（谁改过世界——把一段事实带出会话）</span></div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-audit-vol" title="导出一卷审计事实（纯读：不挤出、不清环、不改计数）——这一节会话里世界被谁改过，只有把它带出去才答得上">导出审计</button>
        <button class="wa-btn" id="wa-audit-vol-check" title="核对一卷从别处拿来的审计（序号链 + 时间链），零状态触碰：不并入环、不改序号、不写盘">带外核对</button>
      </div>
      <textarea id="wa-audit-vol-text" class="wa-ta" placeholder="把一卷审计（JSON）粘在这里再点「带外核对」——上一节会话导出的那种。本侧无卷时照实说「先导出一卷」，不假装核对过"></textarea>
      <div id="wa-audit-vol-out" class="wa-out"></div>
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

      <div class="wa-sec">世界种子库（把这一局的格局存下来，换一局再开）</div>
      <div class="wa-dim">种子存的是<b>骨头</b>：势力格局 / 人物关系网 / 地理 / 时代背景。它<b>不含</b>编年史 / 暗流 / 回声 / 章节 ——
        存了进度就不是新局，是同一个世界的续集。签名的输入只有结构面，故<b>换个名字存同一格局仍会被去重</b>。
        <b>播种只返回计划、不写世界</b>：真去重开一局是宿主（/reset、新对话）的动作 ——
        一个「自己会开新局」的引擎在长局里不可接受。此刻：<b>${wsOn ? '开' : '关'}</b>（关闭时提取／保存／播种一并拒收，
        读数会一直空 —— 这与「还没存过种子」不是一回事）。</div>
      <label class="wa-row"><input id="wa-ws-enabled" type="checkbox" ${wsOn ? 'checked' : ''}/> 启用世界种子库</label>
      <div class="wa-row"><input id="wa-ws-name" class="wa-input" placeholder="种子名（如：三足鼎立·第一次）"/><input id="wa-ws-tags" class="wa-input" placeholder="标签，逗号分隔（三国鼎立 / 都市商战 / 田园 / 门派 / other）"/><button class="wa-btn" id="wa-ws-save" title="写口：把上一次提取的种子存进库（一次 transact、只写 worldSeed.library）。同结构不存两份（duplicate-seed 带已有 id）、库满拒收 library-full —— 不静默挤掉旧种子。去重靠签名不靠名字">保存种子</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-ws-extract" title="纯读：从当前世界提取结构种子（势力/关系网/地理/时代）。四张表全空时拒收 nothing-to-extract —— 不产空种子">提取种子</button><button class="wa-btn" id="wa-ws-list" title="只读：库内清单（名字/标签/签名/各面条数）">种子清单</button><button class="wa-btn" id="wa-ws-stat" title="只读：提取/保存/播种次数、库上限与拒收归因">台账</button></div>
      <div class="wa-row"><input id="wa-ws-id" class="wa-input" placeholder="种子 id（如 ws_1a2b3c4d_5e6f）"/><button class="wa-btn" id="wa-ws-get" title="只读：取一个种子（含结构面与签名）">取种子</button><button class="wa-btn" id="wa-ws-drop" title="写口：从库内删掉一个种子（只动 worldSeed.library 这一格）">删种子</button></div>
      <div class="wa-row"><input id="wa-ws-variance" class="wa-input" placeholder="变异度 0–100（留空=0）"/><button class="wa-btn" id="wa-ws-sow" title="只读推导：给一个种子的播种计划（骨头 + 进度归零）。变异度越界拒收 bad-value（不静默夹住）—— 「你要的变异度」与「真发生的变异度」长得一样是最坏的读数">播种计划</button></div>
      <!-- v2.158.0（S3 + SP6）：种子转移与初始化四控件（转移包 / 包粘贴 / 导入 / 预览 / 确认）。 -->
      <div class="wa-row"><button class="wa-btn" id="wa-ws-pack" title="转移包：把库里一颗种子打包成可跨聊天转移的 JSON（带格式版本/来源/结构签名/容量界限）。全选复制到目标聊天的「导入转移包」即可">打转移包</button><input id="wa-ws-packin" class="wa-input" placeholder="粘贴转移包 JSON（目标聊天导入用）"/><button class="wa-btn" id="wa-ws-import" title="写口：白名单校验接收转移包（bad-pack-ver / bad-seed-keys / duplicate-seed / library-full 四道门，整批交付或整批拒收）">导入转移包</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-ws-init" title="初始化预览：把种子映射到现有状态字段（id 映射 + 引用完整性 + 保留层级说明）。变异在此生成一次，确认应用同一份（不重抽）">初始化预览</button><button class="wa-btn" id="wa-ws-confirm" title="写口（大）：一次事务装完整结构（势力/关系网/地名/时代），进度归零，写 meta.initFrom。只作用于空新局 —— 非空目标拒收 not-empty">初始化确认</button></div>

      <div id="wa-ws-out" class="wa-out"></div>

      <div class="wa-sec">世界蓝图（把这一局的世界原样搬走 / 搬来）</div>
      <div class="wa-dim">蓝图存的是<b>结构</b>：人物稳定 ID 与别名、方向化关系、势力权重、地点（含归属与开关时刻）、
        <b>道路端点</b>与时长容量、时代与日历起点、受支持的静态人设与机制开关。
        它<b>不含</b>人物私密记忆 / 聊天文本 / 已完成事件 / 编年史 / 暗流 / 回声 / 事实 / 外部凭据与脚本 ——
        蓝图搬的是「这个世界长什么样」，不是「这一局发生过什么」。与种子库的分水岭：种子<b>只有显示名</b>
        （两个同名人物会被合并），蓝图给每个实体一个<b>稳定 ID</b>（同一份输入永远得到同一个 key，同名不合并）。
        安装只作用于<b>空新局</b>：非空目标拒收 not-empty，不覆盖既有存档。此刻：<b>${bpOn ? '开' : '关'}</b>
        （关闭时导出／保存／预览／安装一并拒收，读数会一直空 —— 这与「还没导出过」不是一回事）。</div>
      <label class="wa-row"><input id="wa-bp-enabled" type="checkbox" ${bpOn ? 'checked' : ''}/> 启用世界蓝图</label>
      <div class="wa-row"><input id="wa-bp-name" class="wa-input" placeholder="蓝图名（如：三足鼎立·完整版）"/><input id="wa-bp-tags" class="wa-input" placeholder="标签，逗号分隔（三国鼎立 / 都市商战 / 田园）"/><button class="wa-btn" id="wa-bp-save" title="写口：把上一次导出的蓝图存进库（一次 transact、只写 blueprint.library）。同结构不存两份（duplicate-blueprint 带已有 id）、库满拒收 library-full —— 不静默挤掉旧蓝图。去重靠签名不靠名字">保存蓝图</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-bp-export" title="纯读：从当前世界导出完整结构蓝图（白名单提取）。四张表全空时拒收 empty-blueprint —— 不产空蓝图。导出后当场自检引用完整性，悬空即报 dangling-ref（问题出在导出侧而非导入侧）">导出蓝图</button><button class="wa-btn" id="wa-bp-list" title="只读：库内清单（名字/标签/签名/各面条数）">蓝图清单</button><button class="wa-btn" id="wa-bp-stat" title="只读：导出/保存/预览/安装次数、库上限与拒收归因">台账</button></div>
      <div class="wa-row"><input id="wa-bp-id" class="wa-input" placeholder="蓝图 id（如 bp_1a2b3c4d_5e6f）"/><button class="wa-btn" id="wa-bp-get" title="只读：取一张蓝图（含结构与签名）">取蓝图</button><button class="wa-btn" id="wa-bp-drop" title="写口：从库内删掉一张蓝图（只动 blueprint.library 这一格）">删蓝图</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-bp-check" title="纯读：对库内一张蓝图跑引用完整性三判据（重复 ID / 悬空引用 / 未知顶层键）—— 这是安装前的**独立**校验口，与安装侧共用同一份判据，不另写一套">校验蓝图</button><button class="wa-btn" id="wa-bp-empty" title="纯读：当前世界是不是空新局（12 项逐格清点：人物/地点/道路/势力/轮次/纪事/暗流/回声/事实/货品/初始化来源/蓝图安装留痕）。答的是「现在能不能装」，不是「装过没有」">目标空局检查</button></div>
      <div class="wa-row"><input id="wa-bp-keep" class="wa-input" placeholder="保留层级 structure / roster / mech（留空=roster）"/><button class="wa-btn" id="wa-bp-preview" title="纯读预览：把库内一张蓝图映射到现有状态字段（六道门：版本/形状/白名单键/重复 ID/悬空引用/容量 + 目标非空）。预览只做一次映射，确认应用同一份">导入预览</button><button class="wa-btn" id="wa-bp-import" title="写口（大）：一次事务装完整结构（势力/人物/关系/地点/道路/时代），进度归零，写 blueprint.installed。只作用于空新局 —— 非空目标拒收 not-empty；无预览拒收 no-preview">安装蓝图</button></div>
      <div id="wa-bp-out" class="wa-out"></div>
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

  // v2.109.0（#15）：初值改从持久化状态读（此前每次重载都回到「看全部」）——
  //   `=== true` 是刻意的：登记 def 里它是布尔，但手改 localStorage / 旧版本写入会产出
  //   字符串 'true'/'false'，而 read() 的 normalize 会按 def 类型把它归一回布尔。
  let __logErrOnly = __panelState().logErrOnly === true;
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

  const RENDERERS = { overview: renderOverview, world: renderWorld, people: renderPeople, memory: renderMemory, enemies: renderEnemies, parallel: renderParallelWorld, inject: renderInject, sediment: renderSediment, offline: renderOffline, net: renderNet, events: renderEvents, director: renderDirector, connect: renderConnect, tools: renderTools, logs: renderLogs,
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
    // v2.152.0（RP6）：面板渲染链的耗时与 DOM 规模读数。计时包住「渲染 + 过滤 + 绑定」
    //   整段（用户感知到的就是这一整段），读数分流给 ui/render-perf.js（它不自带计时器，
    //   只收数——观测污染被观测者）。renderPerf 缺席时静默跳过（观测面不许拖垮渲染本体）。
    const __rpT0 = (WA.renderPerf && typeof clockWall === 'function') ? clockWall() : null;
    body.innerHTML = RENDERERS[currentPage]();
    // ── v2.149.0（P3）：观测视角过滤**必须挂在重绘出口上** ──
    //   为什么不挂在 bindBody 里、也不逐页手动调：面板每次重绘都整块重建 DOM
    //   （`body.innerHTML = …`），于是上一次过滤的结果**一并被抹掉** —— 挂在重绘出口上
    //   是唯一能保证「过滤结果与渲染结果同寿」的位置。逐页调用会漏页：新增一页时
    //   没人记得补，而那一页在玩家视角下就是全知数据直接外泄（静默、不报错）。
    //   摘除是**DOM 层**的（不是 CSS 隐藏）：CSS 隐藏的数据仍在 DOM 里可读。
    try {
      if (WA.perspective && typeof WA.perspective.applyView === 'function') WA.perspective.applyView(mainDoc);
    } catch (e) { if (WA.log) WA.log('warn', '观测视角过滤失败', e); }
    bindBody();
    try {
      if (__rpT0 !== null && WA.renderPerf && typeof WA.renderPerf.observe === 'function') {
        WA.renderPerf.observe(currentPage, clockWall() - __rpT0,
          body.querySelectorAll('button,input,select,textarea').length);
      }
    } catch (e) { /* 观测面自身失败不进渲染链 */ }
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
    // v2.87.0 B7：题材组合（预览不落设置 / 应用是唯一写入口 / 清空回全量）
    const themeOut = function (text) { setOut('#wa-theme-out', text); };
    const themePicked = function () {
      const els = panelEl.querySelectorAll('.wa-theme-opt');
      const out = [];
      for (let i = 0; i < els.length; i++) { if (els[i].checked) out.push(els[i].value); }
      return out;
    };
    on('#wa-theme-preview', () => {
      if (!WA.theme) { themeOut('题材模块未加载'); return; }
      const picked = themePicked();
      const p = WA.theme.preview(picked);
      let text = '预览：' + p.moduleCount + ' 模块 / ' + p.chars + ' 字（当前 ' + p.currentChars + ' 字，差异 ' + (p.deltaChars >= 0 ? '+' : '') + p.deltaChars + '）'
        + '｜新增 ' + p.added.length + '：' + (p.added.join('、') || '无') + '｜移除 ' + p.removed.length + '：' + (p.removed.join('、') || '无') + '（预览未落设置）';
      // X7（v2.128.0）：**题材生成差异对照**——上面那行只答模块与字数，答不出「注入面哪里不一样」。
      //   这里把「当前生效题材 → 勾选的题材」当一组 A/B 做对照（B7 收口的口径：对注入面做**结构** diff，
      //   不评判生成内容质量）。两侧一致时明说一致，那就是题材没真影响的现场证据。
      const cur = (WA.theme.statView && WA.theme.statView().themes) || [];
      const c = (WA.render && typeof WA.render.themeContrast === 'function') ? WA.render.themeContrast(cur, picked) : null;
      if (c && c.ok) {
        text += c.identical
          ? '｜注入面对照：两侧一致（题材对注入面无结构影响）'
          //   读数取**引擎给的 readout**（模块级承重，并说明差异落在哪一层）：
          //   面板自己拼句子时，遇到「源级增删为空、模块级有差异」会显示成「新增源 无」。
          : '｜注入面对照：' + (c.readout || ('新增源 ' + (c.addedSources.join('、') || '无')
            + '；移除源 ' + (c.removedSources.join('、') || '无')))
            + '（源级投影覆盖 ' + c.coverage.mapped + '/' + c.coverage.sources + ' 个源）';
        if (c.coverage.unmapped.length) text += '｜未映射源 ' + c.coverage.unmapped.length + ' 个：' + c.coverage.unmapped.join('、');
      }
      themeOut(text);
    });
    on('#wa-theme-apply', () => {
      if (!WA.theme) { themeOut('题材模块未加载'); return; }
      const r = WA.theme.apply(themePicked());
      themeOut(r.ok ? ('已应用：' + (r.themes.join('+') || '全量') + '（' + ((r.modules || []).length) + ' 模块）') : ('拒收：' + r.reason + '（未知 ' + ((r.unknown || []).join('、')) + '）'));
      if (r.ok) renderBody();
    });
    on('#wa-theme-clear', () => {
      if (!WA.theme) return;
      WA.theme.apply([]);
      themeOut('已清空题材：回到全量注入');
      renderBody();
    });
    // v2.87.0 B6：因果工作台——当前/累计分列、干预预览、分支试演、冲突显式选择、回放证据。
    //   这四口此前只有测试引用（test-only ⇒ 死导出）。本仓库纪律：导出即有承诺，
    //   承诺的消费方是**面板**而不是测试。
    const cwOut = function (html) { setHtml('#wa-cw-out', html); };
    const cwFmt = function (o) { const ks = Object.keys(o || {}); return ks.length ? ks.map(function (k) { return k + '×' + o[k]; }).join('、') : '无'; };
    const cwDraw = function () {
      if (!WA.causal) { cwOut('<div class="wa-dim">因果模块未加载</div>'); return; }
      const v = (typeof WA.causal.stateView === 'function') ? WA.causal.stateView() : null;
      const st = WA.causal.stat();
      if (!v) { cwOut('<div class="wa-dim">状态视图不可用</div>'); return; }
      cwOut('<div class="wa-item"><b>当前存档</b>（现存 ' + v.chains + ' 链）' + '<div class="wa-dim">在途 ' + v.live + ' / 终态 ' + v.terminal
        + '｜按状态 ' + cwFmt(v.byStatus) + '｜按阶段 ' + cwFmt(v.byStage) + (v.pending ? '（条件未足 ' + v.pending + ' 条）' : '')
        + '｜待发生 ' + v.scheduledDelayed + ' 项｜已结算 ' + v.settledRows + ' 行</div>'
        + '<div class="wa-dim">本次进程累计：行动 ' + st.acts + ' / 过期 ' + st.expired + ' / 被挡 ' + st.blocked + '</div></div>');
    };
    on('#wa-cw-view', () => { cwDraw(); });
    on('#wa-cw-rehearse', () => {
      if (!WA.causal) return;
      const f = { now: clockNow('ui.causal'), pruneInvalid: false };
      const r = WA.causal.rehearse(f);
      if (!r.ok) { cwOut('<div class="wa-dim">试演未执行：' + esc(r.reason) + '</div>'); return; }
      const v = WA.causal.stateView();
      cwOut('<div class="wa-item"><b>试演（零副作用）</b>：会动 ' + r.counts.changed + ' 条（行动 ' + r.counts.acted + ' / 过期 ' + r.counts.expired + '）'
        + '｜存档实际仍为 ' + v.live + ' 在途<div class="wa-dim">'
        + (r.changes.length ? r.changes.map(function (c) { return esc(c.id) + ' ' + esc(c.from) + ' → ' + esc(c.to); }).join('；') : '无状态变化') + '</div></div>');
    });
    const cwKeep = function (id) {
      if (!WA.causal) return;
      // 「都留」= 显式选择不消解（动作上一次**选择**，而不是默认放任）。
      if (id === 'both') { cwOut('<div class="wa-dim">已选择「都留」：两条链均保留。这是选择，不是默认。</div>'); return; }
      const hit = WA.causal.conflicts().filter(function (c) { return c.ids.indexOf(id) >= 0; })[0];
      // v2.87.0 自纠：不新造拒收码。other 取不到时直接把空串交给 cancel——
      //   它自己的 missing-fields 就是对的归因（面板多一个语义相同的码，
      //   只会让「未分类」在 reject-code-gate 上多一份要维护的账）。
      const other = hit ? hit.ids.filter(function (x) { return x !== id; })[0] : '';
      const r = WA.causal.cancel(other, '冲突消解：保留 ' + id);
      cwOut('<div class="wa-item">保留 <b>' + esc(id) + '</b>，取消 <b>' + esc(other) + '</b>：' + (r.ok ? '已取消' : esc(r.reason)) + '</div>');
      renderBody();
    };
    on('#wa-cw-conflicts', () => {
      if (!WA.causal) return;
      const cs = WA.causal.conflicts();
      if (!cs.length) { cwOut('<div class="wa-dim">无同因同果的在途重复链</div>'); return; }
      cwOut(cs.map(function (c) {
        return '<div class="wa-item"><b>冲突</b> ' + esc(c.cause) + ' → ' + esc(c.action)
          + '<div class="wa-dim">' + esc(c.note) + '</div>'
          + '<div class="wa-row"><button class="wa-btn wa-mini" data-cw-keep="' + esc(c.ids[0]) + '">留 ' + esc(c.ids[0]) + '</button>'
          + '<button class="wa-btn wa-mini" data-cw-keep="' + esc(c.ids[1]) + '">留 ' + esc(c.ids[1]) + '</button>'
          + '<button class="wa-btn wa-mini" data-cw-keep="both">都留</button></div></div>';
      }).join(''));
      // 动态渲染的按钮在绑定期还不存在，故在这里就地接线（不是委派——mini-DOM 无冒泡支持）。
      const bs = panelEl.querySelectorAll('[data-cw-keep]');
      for (let i = 0; i < bs.length; i++) { bs[i].onclick = function () { cwKeep(this.dataset.cwKeep); }; }
    });
    on('#wa-cw-evidence', () => {
      if (!WA.causal) return;
      const e = WA.causal.evidence();
      // v2.89.0 O2：两句结论**分开念**。「种子是显式定的」（reproducible）与
      //   「这一轮有一卷能重放的磁带」（replayable）不是同一件事——合成一句就是失实。
      const tp = e.tape || {};
      const why = { 'auto-seed': '自动种子刷新即换', 'no-tape': '本会话尚未录到磁带', 'rand-absent': '随机源未加载', 'tape-mismatch': '磁带与当前不符' };
      cwOut('<div class="wa-item"><b>回放证据</b>：seed ' + esc(String(e.seed)) + '（来源 ' + esc(e.seedSource) + '）'
        + '｜可复现：' + (e.reproducible ? '<b>是</b>（显式播种）' : '<b>否</b>——自动种子刷新即换，不得据此声称本轮可重放')
        + '｜抽取 ' + e.draws + ' 次｜通道 ' + esc((e.channels || []).join('、') || '无')
        + '<div class="wa-dim">磁带：' + esc(String(tp.mode || '?')) + '｜' + (tp.entries | 0) + ' 格（决策 ' + (tp.values | 0) + '）'
        + '｜未命中 ' + (tp.miss | 0) + (tp.lastMiss ? '（' + esc(tp.lastMiss.why) + '：' + esc(tp.lastMiss.want) + ' ← ' + esc(tp.lastMiss.got) + '）' : '')
        + '｜种子相符 ' + (tp.seedMatched === true ? '是' : tp.seedMatched === false ? '<b>否</b>' : '未知') + '</div>'
        + '<div class="wa-dim">可重放：' + (e.replayable ? '<b>是</b>' : '<b>否</b>（' + esc(why[e.replayBlockedBy] || e.replayBlockedBy || '—') + '）')
        + '｜录制 ' + (e.records | 0) + ' 次 / 回放 ' + (e.replays | 0) + ' 次 / 录制失败 ' + (e.recordFails | 0) + '</div>'
        + '<div class="wa-dim">语义坐标：' + (e.coord && e.coord.marked
          ? ('第 ' + esc(String(e.coord.round)) + ' 轮 · 段 ' + esc(e.coord.label || '（空段名）'))
          : '未标记（无人打标记时照实说不——不编一个轮次）')
        + '｜无坐标格 ' + ((e.coordGaps && typeof e.coordGaps.orphanSlots === 'number') ? e.coordGaps.orphanSlots : '未知')
        + '：0 时可指着「第几轮第几步」，>0 时只能说「第几格」</div>'
        + '<div class="wa-dim">与推进绑定的读数：链 ' + e.chains + ' · 行动 ' + e.acts + ' · 过期 ' + e.expired + ' · 被挡 ' + e.blocked + '</div></div>');
    });
    on('#wa-cw-record', () => {
      if (!WA.causal || typeof WA.causal.record !== 'function') { cwOut('<div class="wa-dim">因果模块未加载</div>'); return; }
      // 录制的是**真跑一轮**（tick 会写世界）——这与「试演」刻意相反：
      //   试演证「如果这么走会怎样」（零副作用、前瞻）；录制证「这一轮实际是怎么走的」（留痕、回溯）。
      //   两者都必须存在：只有前者则无从复核已经发生的事，只有后者则动手前先瞎一次。
      const r = WA.causal.record(function () { return WA.causal.tick({ now: clockNow('ui.causal') }); });
      if (!r.ok) {
        cwOut('<div class="wa-item"><b>录制失败</b>：' + esc(String(r.reason || '?'))
          + (r.tape ? '' : '')
          + '<div class="wa-dim">失败也把磁带交回（部分录制是证据）——只是不构成一次完整的复现依据。</div></div>');
        return;
      }
      const t = r.tape || {};
      cwOut('<div class="wa-item"><b>已录制一轮</b>：seed ' + esc(String(r.seed)) + '｜磁带 ' + (r.count | 0) + ' 格'
        + '｜推进结果 ' + esc(JSON.stringify(r.result || {}))
        + '<div class="wa-dim">接着点「复核磁带」可验证它出自这个种子；点「回放证据」可看可重放与否（未显式播种时照实报否）。</div></div>');
    });
    on('#wa-cw-verify', () => {
      if (!WA.rand || typeof WA.rand.verifyTape !== 'function') { cwOut('<div class="wa-dim">随机源未加载</div>'); return; }
      const st = WA.causal && WA.causal.stat ? WA.causal.stat() : null;
      const last = (st && st.lastTape && st.lastTape.ok) ? st.lastTape.tape : null;
      if (!last) {
        cwOut('<div class="wa-dim">本会话尚未录到磁带——先做一次「录制一轮」（<code>WorldAxis.causal.record(fn)</code>）再复核。<br>'
          + '注意：复核的是<b>已录下来的那一轮</b>，不是「现在再跑一次」。</div>');
        return;
      }
      const v = WA.rand.verifyTape(last);
      const fm = v.firstMismatch;
      cwOut('<div class="wa-item"><b>磁带复核（纯算术，零副作用）</b>：seed ' + esc(String(v.seed))
        + '｜比对 ' + v.checked + ' 格｜一致：' + (v.ok ? '<b>是</b>' : '<b>否</b>（错 ' + v.mismatches + ' 格）')
        + (fm ? '<div class="wa-dim">第一处分歧：第 ' + fm.at + ' 格 · 通道 ' + esc(fm.channel) + ' · 应为 ' + esc(String(fm.want)) + ' 实为 ' + esc(String(fm.got)) + '</div>' : '')
        + '<div class="wa-dim">坐标覆盖：有坐标 ' + v.withCoord + ' 格 · 无坐标 ' + v.orphanSlots + ' 格 · 轮次 '
        + esc((v.rounds || []).join('、') || '无') + '（无坐标格 >0 时，上面那句「第几格」是真话，「第几轮第几步」这次说不出口）</div>'
        + '<div class="wa-dim">通道 ' + esc((v.channels || []).join('、') || '无') + '｜异常格 ' + v.oddKinds
        + '<br>它证的是「这卷磁带确实出自这个种子」；「同一段代码按磁带再走一遍」由 <code>causal.replayWith</code> 负责——后者要重跑代码，故对会写世界的轮次不适用。</div></div>');
    });
    // ── v2.98.0 P2：磁带卷（跨会话可查）。**显式触发**——本模块不自动落盘，
    //   与 O6 的「导出流水 / 带外对账」同规格：要不要把这一卷带出会话，是按下这一刻的决定。
    on('#wa-cw-vol', () => {
      if (!WA.rand || typeof WA.rand.tapeVol !== 'function') { cwOut('<div class="wa-dim">随机源未加载</div>'); return; }
      let v = null; try { v = WA.rand.tapeVol(); } catch (e) { return cwOut('<div class="wa-dim">导出磁带失败：导出抛错（export-throw）</div>'); }
      // 「没有卷」与「有空卷」是两件事：前者照实说没得导，后者导出成功但 0 格。
      if (!v || !v.ok) { cwOut('<div class="wa-dim">导出磁带：' + esc((v && v.reason) || 'no-tape') + '（' + ((v && v.reason) === 'no-tape' ? '本会话尚未录到磁带——先点「录制一轮」' : '卷不可导出') + '）</div>'); return; }
      const t = $('#wa-cw-vol-text');
      const json = JSON.stringify(v);
      if (t) t.value = json;
      const summary = '磁带卷 · ' + esc(v.format) + ' v' + v.formatVersion + ' · ' + v.entries + ' 格（决策 ' + v.values + '）'
        + '｜种子 ' + esc(String(v.seed)) + '｜' + (v.opened ? (v.entries ? '<b>录制中</b>：这是此刻录到哪儿的快照，不是收卷后的完整卷' : '<b>录制中</b>（尚未录到任何一格）') : '已收卷')
        + (v.truncated ? ' · <b>已截断</b>：链首无上游可核，只含带内' : ' · 完整卷（磁带无环形挤出，故本侧永不截断）');
      cwOut('<div class="wa-item"><b>已导出一卷磁带</b>：' + summary
        + '<div class="wa-dim">卷已填进下面的粘贴框（' + json.length + ' 字符）——把它带到别处（或下一节会话），再用「带外核对」核。'
        + '注意本模块<b>没有</b>替你写盘：要不要留下这一卷由你决定。</div></div>');
    });
    on('#wa-cw-vol-check', () => {
      if (!WA.rand || typeof WA.rand.verifyTapeWith !== 'function') { cwOut('<div class="wa-dim">随机源未加载</div>'); return; }
      const raw = ($('#wa-cw-vol-text') ? ($('#wa-cw-vol-text').value || '') : '').trim();
      // 没有卷时不假装核对过：「没核」与「核过一致」是两件事（与 O6 的 no-volume 同口径）。
      if (!raw) { cwOut('<div class="wa-dim">带外核对：no-volume —— 先把一卷磁带粘进上面的框里再核。'
        + '<br>（本侧不会替你从存档里找一个卷出来：磁带在本模块里不落盘，那样做等于假装有第二份真源。）</div>'); return; }
      let vol = null;
      try { vol = JSON.parse(raw); } catch (e) { cwOut('<div class="wa-dim">带外核对：bad-volume —— 粘进来的不是合法 JSON（' + esc(String(e && e.message || e)) + '）</div>'); return; }
      let r = null; try { r = WA.rand.verifyTapeWith(vol); } catch (e) { cwOut('<div class="wa-dim">带外核对：核对抛错（本口承诺不抛——这是一个缺陷，不是配置问题）</div>'); return; }
      if (!r) { cwOut('<div class="wa-dim">带外核对：无结论</div>'); return; }
      // 拒收（格式头/行面）照原码带出，不与「核对过了但不一致」混成一句
      if (r.ok === false && r.reason) {
        const want = r.want !== undefined ? ('（期望 ' + esc(String(r.want)) + '，实为 ' + esc(String(r.got)) + '）') : '';
        cwOut('<div class="wa-item"><b>带外核对：卷不合规，未核对</b> ' + esc(String(r.reason)) + want
          + (r.reason === 'bad-tape' ? '<div class="wa-dim">行面读不了——卷里的格不是对象。连读都读不了的卷不该说成「核对不一致」，两者是两件事。</div>' : '')
          + '</div>');
        return;
      }
      const fm = r.firstMismatch;
      // 位置链与值链**分开念**：位置断了不代表值错，值对上了也不代表位置没断
      const posLine = r.posOk ? '位置链完整（' + r.entries + ' 格逐格递增，无跳号无重复）'
        : '<b>位置链断了</b> ' + (r.posBroken || []).length + ' 处（首处第 ' + ((r.posBroken || [{}])[0].at | 0) + ' 格：期望 n=' + ((r.posBroken || [{}])[0].want) + '，实为 ' + esc(String((r.posBroken || [{}])[0].got)) + '）'
          + '——这卷被改过，或由别的东西拼出来；它与值对得上对不上是两回事';
      const valLine = r.outcome === 'no-seed' ? '<b>值链无从核对</b>（卷里没有种子：seed=null）——「能不能核对」与「核对结果」是两句不同的话'
        : r.outcome === 'bad-seed' ? '<b>值链无从核对</b>（种子非法：' + esc(String(r.seed)) + '）'
          : r.outcome === 'entailed' ? '值链一致（比对 ' + r.compared + ' 格，逐值相同）'
            : '<b>值链有分歧</b> ' + r.mismatches + ' 格'
              + (fm ? '（首处第 ' + fm.at + ' 格 · 通道 ' + esc(fm.channel) + ' · 应为 ' + esc(String(fm.want)) + '，实为 ' + esc(String(fm.got)) + '）' : '');
      // 「卷内自洽」与「与本侧一致」必须与 O6 同款分开念：本侧没有第二份真源可比。
      const scopeLine = r.compared === 0
        ? '比了 0 格：本口只答「卷内自洽 / 位置链完整」，<b>不答</b>「与本侧一致」——本侧磁带不落盘，没有第二份真源可比。'
        : '比了 ' + r.compared + ' 格（通道 ' + esc((r.chUsed || []).join('、') || '无') + '）——一律是<b>卷内</b>核对。';
      cwOut('<div class="wa-item"><b>带外核对（零状态触碰：不装卷、不推进、不改当前模式）</b>'
        + '<div class="wa-dim">' + posLine + '</div>'
        + '<div class="wa-dim">' + valLine + '</div>'
        + '<div class="wa-dim">' + scopeLine + '</div>'
        + '</div>');
    });
    // v2.148.0（RP2）：磁带仓库四口——面板是真消费方。「存入」读导出框里的卷（JSON），
    //   不重新导出（重新导出 = 对同一对象做第二次取证动作）；「取回」只还原对象，
    //   不自动进回放（回放是因果页「回放」按钮的既有职责）。
    on('#wa-cw-store-save', () => {
      const out = $('#wa-cw-store-out'); const setStoreOut = (h) => { if (out) out.innerHTML = h; };
      if (!WA.tapeStore || typeof WA.tapeStore.save !== 'function') { setStoreOut('<div class="wa-dim">磁带仓库未加载</div>'); return; }
      const t = $('#wa-cw-vol-text');
      const raw = t ? (t.value || '').trim() : '';
      if (!raw) { setStoreOut('<div class="wa-dim">存入仓库：导出框为空——先点「导出磁带」把当前卷带出来，或粘贴一卷 JSON</div>'); return; }
      let vol = null;
      try { vol = JSON.parse(raw); } catch (e) { setStoreOut('<div class="wa-dim">存入仓库：JSON 解析失败（' + esc(String(e && e.message || e)) + '）</div>'); return; }
      const r = WA.tapeStore.save(vol);
      if (!r || !r.ok) { setStoreOut('<div class="wa-dim">存入仓库：' + esc((r && r.reason) || 'unknown') + (r && r.reason === 'tape-version-mismatch' ? '（卷的格式版本与本仓不同——本版不做迁移器，如实拒收）' : '') + '</div>'); return; }
      setStoreOut('<div>已存入：' + esc(r.id) + ' · ' + r.entries + ' 格' + (r.evicted && r.evicted.length ? ' · 回收最旧 ' + r.evicted.length + ' 卷' : '') + '</div>');
    });
    on('#wa-cw-store-list', () => {
      const out = $('#wa-cw-store-out'); const setStoreOut = (h) => { if (out) out.innerHTML = h; };
      if (!WA.tapeStore || typeof WA.tapeStore.list !== 'function') { setStoreOut('<div class="wa-dim">磁带仓库未加载</div>'); return; }
      const li = WA.tapeStore.list();
      if (!li || !li.ok) { setStoreOut('<div class="wa-dim">仓库清单：' + esc((li && li.reason) || 'unknown') + '</div>'); return; }
      if (!li.rows.length) { setStoreOut('<div class="wa-dim">仓库为空——存入第一卷后这里会有清单</div>'); return; }
      setStoreOut('<div>' + li.rows.map((r) => ('<div class="wa-dim">' + esc(r.id) + ' · seed=' + (r.seed === null || r.seed === undefined ? '无' : r.seed) + ' · ' + r.entries + ' 格 · ' + new Date(r.savedAt).toLocaleString() + '</div>')).join('') + '</div>');
    });
    on('#wa-cw-store-load', () => {
      const out = $('#wa-cw-store-out'); const setStoreOut = (h) => { if (out) out.innerHTML = h; };
      if (!WA.tapeStore || typeof WA.tapeStore.load !== 'function') { setStoreOut('<div class="wa-dim">磁带仓库未加载</div>'); return; }
      const idIn = $('#wa-cw-store-id');
      const id = idIn ? (idIn.value || '').trim() : '';
      if (!id) { setStoreOut('<div class="wa-dim">按号取回：先填卷 id（点「仓库清单」可查看全部 id）</div>'); return; }
      const r = WA.tapeStore.load(id);
      if (!r || !r.ok) { setStoreOut('<div class="wa-dim">按号取回：' + esc((r && r.reason) || 'unknown') + '</div>'); return; }
      // 取回结果写回导出框（与「带外核对」共用输入面），回放走因果页既有「回放」路径
      const t = $('#wa-cw-vol-text');
      if (t) t.value = JSON.stringify({ format: 'worldaxis.rand.tape', formatVersion: 1, seed: r.tape.seed, rows: r.tape.entries.map((e) => ({ c: e.c, v: e.v, k: e.k, n: e.n, r: e.r, s: e.s })) });
      setStoreOut('<div>已取回 ' + esc(id) + '：' + r.tape.entries.length + ' 格已写回导出框——要回放请点上方「回放」相关入口</div>');
    });
    on('#wa-cw-store-drop', () => {
      const out = $('#wa-cw-store-out'); const setStoreOut = (h) => { if (out) out.innerHTML = h; };
      if (!WA.tapeStore || typeof WA.tapeStore.drop !== 'function') { setStoreOut('<div class="wa-dim">磁带仓库未加载</div>'); return; }
      const idIn = $('#wa-cw-store-id');
      const id = idIn ? (idIn.value || '').trim() : '';
      if (!id) { setStoreOut('<div class="wa-dim">删除一卷：先填卷 id</div>'); return; }
      if (!window.confirm('删除卷 ' + id + '？此操作不可逆。')) { setStoreOut('<div class="wa-dim">已取消</div>'); return; }
      const r = WA.tapeStore.drop(id);
      if (!r || !r.ok) { setStoreOut('<div class="wa-dim">删除一卷：' + esc((r && r.reason) || 'unknown') + '</div>'); return; }
      setStoreOut('<div>已删除 ' + esc(id) + '</div>');
    });
    on('#wa-cw-intervene', () => {
      if (!WA.causal) return;
      const id = causalVal('#wa-cw-id');
      const act = causalVal('#wa-cw-act') || 'advance';
      if (!id) { cwOut('<div class="wa-dim">请先填链 id</div>'); return; }
      const p = WA.causal.previewIntervention(id, act, { now: clockNow('ui.causal'), pruneInvalid: false, reason: '面板预览', delayedId: causalVal('#wa-cw-act') === 'settle' ? id : '' });
      if (!p.ok) { cwOut('<div class="wa-dim">预览失败：' + esc(p.reason) + '</div>'); return; }
      const to = p.after ? (p.after.status + '/' + p.after.stage) : '-';
      cwOut('<div class="wa-item"><b>干预预览（零副作用）</b> ' + esc(p.chain) + ' · ' + esc(p.action) + '：'
        + (p.allowed ? ('允许 · ' + esc(p.before.status + '/' + p.before.stage) + ' → ' + esc(to)) : ('<b>不允许</b>：' + esc(p.reason)))
        + ((p.willWrite && p.willWrite.length) ? '<div class="wa-dim">将写事实：' + esc(p.willWrite.join('、')) + '</div>' : '') + '</div>');
    });
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
        setOut('#wa-wb-out', '预览：注入 ' + n + '/' + rows.length + (__wbScan ? '（扫描 ' + __wbScan.length + ' 字）' : '（无扫描文本）')
          + (function () {
            // v2.129.0（A10）：即时搜索面。此前“条目多到找不到”与“条目根本不存在”
            //   在面板上是同一幅画面（都是没看见）——用扫描文本反查**哪些条目真的写过它**。
            //   读点挂在**既有**控件上（零新增控件 ⇒ 不触碰 UI 绑定守卫）。
            if (!WA.wbSearch || typeof WA.wbSearch.count !== 'function') return '';
            const q = __wbScan.trim();
            if (!q) return '';
            const hit = WA.wbSearch.count(q);
            return (hit && hit.ok) ? '｜按词条搜同串：命中 ' + hit.matched + '/' + hit.total + ' 条' : '';
          })());
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
      // v2.92.0：读数类出口（带 summary）不再是「回执」措辞——把核对结论说成「已记录」
      //   会让对账断裂读起来像一次成功写盘。
      const okText = (r && r.summary) ? ('账本 · ' + r.summary) : ('已记录 ' + ((r && (r.id || r.reason)) || 'ok'));
      const text = r && r.ok ? okText : ('未记录：' + ((r && r.reason) || '未知原因'));
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
    on('#wa-org-ledger', () => {
      if (!WA.org || !WA.org.ledgerView) return orgOut({ ok: false, reason: 'module-missing' }, true);
      let v = null; try { v = WA.org.ledgerView(); } catch (e) { return orgOut({ ok: false, reason: 'ledger-throw' }, true); }
      const ab = v.anomalies || { count: 0, stockDrift: [], negativeStock: [], overpay: [] };
      const rc = v.reconciled || {};
      // v2.92.0：失败分支必须给出**可读原因**。首版在断裂时留空 reason，面板于是印出
      //   「未记录：未知原因」——而事实是「存量与流水对不上」，两句话南辕北辙。
      const why = ab.count && rc.ok === false ? 'anomaly+reconcile-break' : (ab.count ? 'anomaly' : (rc.ok === false ? 'reconcile-break' : ''));
      const summary = '持有者 ' + v.holderCount + ' · 流水 ' + v.entries + ' 笔（挤出 ' + v.dropped + '）· 流入 ' + v.flow.in + ' / 流出 ' + v.flow.out + ' · 异常笔 ' + ab.count
        + (ab.count ? '（负库存 ' + ab.negativeStock.length + ' / 前后值漂移 ' + ab.stockDrift.length + ' / 超额支付 ' + ab.overpay.length + '）' : '')
        + ' · 对账 ' + (rc.ok ? '自洽' : (rc.breakCount || 0) + ' 处断裂' + (rc.truncated ? '（流水已截断，仅核对带内）' : ''));
      // 读数与「写盘回执」分开措辞：账本按钮报的是**核对结论**，不是「刚才那笔记下来了」。
      if (why) return orgOut({ ok: false, reason: why, summary: summary }, true);
      const o = $('#wa-org-out');
      const text = '账本 · ' + summary;
      panelEl.dataset.orgOut = text;
      if (o) o.textContent = text;
    });
    // ── v2.94.0（O6）：流水导出 / 带外对账。**显式触发**——落盘由用户按下这一刻决定，
    //   不由每次交易隐式发生（自动落盘会把观测面变成隐式写盘面 + 性能陷阱）。
    on('#wa-org-export', () => {
      if (!WA.org || !WA.org.exportJournal) return orgOut({ ok: false, reason: 'module-missing' }, true);
      let v = null; try { v = WA.org.exportJournal(); } catch (e) { return orgOut({ ok: false, reason: 'export-throw' }, true); }
      if (!v || !v.ok) return orgOut({ ok: false, reason: (v && v.reason) || 'export-unavailable' }, true);
      // 导出即存档点：把这一卷留在面板 dataset 里，供「带外对账」当场核对（不写 localStorage）。
      try { panelEl.__orgVol = v; } catch (e) {}
      const summary = '流水卷 · ' + v.format + ' v' + v.formatVersion + ' · 带内 ' + v.entries + ' 笔（上限 ' + v.cap + '，累计 ' + v.recorded + '，挤出 ' + v.dropped + '）'
        + (v.truncated ? ' · **已截断**：链首无上游可核，只含带内' : ' · 完整卷');
      const o = $('#wa-org-out');
      const text = '账本 · ' + summary;
      panelEl.dataset.orgOut = text;
      if (o) o.textContent = text;
    });
    on('#wa-org-reconcile', () => {
      if (!WA.org || !WA.org.reconcileWith) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const vol = panelEl.__orgVol;
      // 没有卷时不假装核对过：如实说「先导出一卷」——「没核」与「核过一致」是两件事。
      if (!vol) return orgOut({ ok: false, reason: 'no-volume', summary: '先点「导出流水」得到一卷，再核' }, true);
      let rc = null; try { rc = WA.org.reconcileWith(vol); } catch (e) { return orgOut({ ok: false, reason: 'reconcile-throw' }, true); }
      if (!rc || rc.ok === undefined) return orgOut({ ok: false, reason: (rc && rc.reason) || 'bad-volume', summary: '流水卷不合规，未核对' }, true);
      const summary = '带外对账 · 核 ' + rc.checked + ' 笔 · ' + (rc.ok ? '自洽' : (rc.breakCount || 0) + ' 处断裂') + (rc.truncated ? '（卷已截断）' : '');
      const o = $('#wa-org-out');
      const text = '账本 · ' + summary;
      panelEl.dataset.orgOut = text;
      if (o) o.textContent = text;
    });
    // 经济风读数：**只读**——不回落成「平稳」（引擎缺席 / 字段缺失各有其名）。
    on('#wa-org-climate', () => {
      if (!WA.org || !WA.org.ledgerView) return orgOut({ ok: false, reason: 'module-missing' }, true);
      let v = null; try { v = WA.org.ledgerView(); } catch (e) { return orgOut({ ok: false, reason: 'ledger-throw' }, true); }
      const c = v.climate || {};
      if (!c.available) return orgOut({ ok: false, reason: c.reason || 'climate-unavailable', summary: '经济风不可读（' + (c.reason || '?') + '）——不回落成「平稳」' }, true);
      const summary = '经济风 · ' + c.climate + (c.reason === 'unknown-climate' ? '（**表外气候词**，由调用方面对）' : '') + ' · 信号 ' + (c.signals || []).length + ' 条';
      const o = $('#wa-org-out');
      const text = '账本 · ' + summary;
      panelEl.dataset.orgOut = text;
      if (o) o.textContent = text;
    });
    // ── v2.95.0（X2 · B3）：经济引擎——职册 / 功簿 / 薪俸 / 欠薪 / 罚没。
    //   每个口一个**真消费方**（本处即消费方），且全部走既有 transfer 通道——
    //   于是这些按钮产生的每一笔都自动进 O5 流水、可被 O6 带外对账核、异常时进 O7 健康分。
    on('#wa-org-assign', () => {
      if (!WA.org || !WA.org.assignRole) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.org.assignRole(orgVal('#wa-org-kind'), orgVal('#wa-org-person') || orgVal('#wa-org-name'), orgVal('#wa-org-role'));
      // 「刚收进来」与「本来就是他」必须可区分：改任读起来不能像一次招聘。
      orgOut(Object.assign({}, r, { id: r.ok ? (r.role + (r.changed ? ':changed' : ':new') + ':' + r.count) : r.id }), true);
      renderBody();
    });
    on('#wa-org-credit', () => {
      if (!WA.org || !WA.org.creditWork) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.org.creditWork(orgVal('#wa-org-kind'), orgVal('#wa-org-person') || orgVal('#wa-org-name'), orgVal('#wa-org-qty'));
      // 够格只报 ready，不自动晋升——晋升是显式决策，不是记账的副作用。
      orgOut(Object.assign({}, r, { id: r.ok ? ('contrib:' + r.contrib + (r.ready ? ':ready' : ':need-' + r.need)) : r.id }), true);
      renderBody();
    });
    on('#wa-org-promote', () => {
      if (!WA.org || !WA.org.promote) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.org.promote(orgVal('#wa-org-kind'), orgVal('#wa-org-person') || orgVal('#wa-org-name'));
      // 门槛不达标时照实报差多少（need/have），不四舍五入、不「看表现」。
      orgOut(Object.assign({}, r, { id: r.ok ? (r.from + '→' + r.to) : (r.reason === 'insufficient-contrib' ? ('contrib ' + r.have + '/' + r.need) : r.id) }), true);
      renderBody();
    });
    on('#wa-org-roster', () => {
      if (!WA.org || !WA.org.rosterView) return orgOut({ ok: false, reason: 'module-missing' }, true);
      let v = null; try { v = WA.org.rosterView(orgVal('#wa-org-kind')); } catch (e) { return orgOut({ ok: false, reason: 'roster-throw' }, true); }
      if (!v || !v.ok) return orgOut({ ok: false, reason: (v && v.reason) || 'roster-unavailable' }, true);
      const t = v.tide || {};
      // 两档同账不同词：精确档给倍率、叙事档给词；经济风不可读时词为 null（不借用「如常」）。
      const summary = '名册 · ' + v.faction + ' · ' + v.count + ' 人 · 欠薪 ' + v.owed
        + ' · 经济风 ' + (t.known ? (t.word + '（×' + t.mul + '）') : ('不可读（' + (t.reason || '?') + '）——不回落成「如常」'));
      const o = $('#wa-org-out');
      const text = '账本 · ' + summary;
      panelEl.dataset.orgOut = text;
      if (o) o.textContent = text;
    });
    on('#wa-org-pay', () => {
      if (!WA.org || !WA.org.payroll) return orgOut({ ok: false, reason: 'module-missing' }, true);
      let r = null; try { r = WA.org.payroll(orgVal('#wa-org-kind'), { item: orgVal('#wa-org-item') }); } catch (e) { return orgOut({ ok: false, reason: 'payroll-throw' }, true); }
      if (!r || !r.ok) return orgOut({ ok: false, reason: (r && r.reason) || 'payroll-unavailable' }, true);
      // `ok` 答「流程跑完了没有」，`settled` 答「从此不欠谁了吗」——两者分开印。
      //   流程跑完而全员欠薪，是最坏也最容易被读成成功的一种结局。
      const summary = '发薪 · ' + r.faction + ' · ' + r.count + ' 人 · 已发 ' + r.paid + ' · 欠 ' + r.leftOwed
        + (r.settled ? ' · 发清了' : ' · **未发清**（' + (r.reason || 'partial') + '，欠薪记在名册上）');
      const o = $('#wa-org-out');
      const text = '账本 · ' + summary;
      panelEl.dataset.orgOut = text;
      if (o) o.textContent = text;
      renderBody();
    });
    on('#wa-org-settle', () => {
      if (!WA.org || !WA.org.settleOwed) return orgOut({ ok: false, reason: 'module-missing' }, true);
      let r = null; try { r = WA.org.settleOwed(orgVal('#wa-org-kind'), orgVal('#wa-org-person') || orgVal('#wa-org-name'), { item: orgVal('#wa-org-item') }); } catch (e) { return orgOut({ ok: false, reason: 'settle-throw' }, true); }
      if (!r || !r.ok) return orgOut(Object.assign({}, r || {}, { ok: false, reason: (r && r.reason) || 'settle-unavailable' }), true);
      // 只补得起的量：余额照实留着，不把「还欠着」抹成「清了」。
      orgOut(Object.assign({}, r, { id: (r.settled ? 'cleared:' : 'partial:') + r.paid + ':' + r.left }), true);
      renderBody();
    });
    on('#wa-org-penalize', () => {
      if (!WA.org || !WA.org.penalize) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.org.penalize(orgVal('#wa-org-kind'), orgVal('#wa-org-person') || orgVal('#wa-org-name'), orgVal('#wa-org-item'), orgVal('#wa-org-qty'));
      orgOut(Object.assign({}, r, { id: r.ok ? (r.item + ':' + r.amount + '→' + r.to) : r.id }), true);
      renderBody();
    });
    // ── v2.117.0（计划二 B5）：组织行动——立项目 / 交付 / 结项 / 债务。
    //   每个口一个**真消费方**（本处即消费方）；交付一律走 transfer（在引擎内部），
    //   于是这些按钮产生的每一笔都自动进 O5 流水、可被 O6 带外对账核、异常时进 O7 健康分。
    on('#wa-org-proj-open', () => {
      if (!WA.org || !WA.org.openProject) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.org.openProject(orgVal('#wa-org-kind'), { what: orgVal('#wa-org-project'),
        needs: orgVal('#wa-org-needs'), by: orgVal('#wa-org-person') || orgVal('#wa-org-name'), due: orgVal('#wa-org-due') });
      orgOut(Object.assign({}, r, { id: r.ok ? (r.what + ':' + r.needs.map(function (x) { return x.item + x.need; }).join('+')) : r.id }), true);
      renderBody();
    });
    on('#wa-org-proj-deliver', () => {
      if (!WA.org || !WA.org.deliverToProject) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.org.deliverToProject(orgVal('#wa-org-kind'), orgVal('#wa-org-project'),
        orgVal('#wa-org-person') || orgVal('#wa-org-name'), orgVal('#wa-org-item'), orgVal('#wa-org-qty'));
      // take < offered 时照实报还差多少没进去（short），不静默截断。
      orgOut(Object.assign({}, r, { id: r.ok ? (r.item + ':' + r.took + '/' + r.offered + (r.complete ? ':ready' : ':partial')) : r.id }), true);
      renderBody();
    });
    on('#wa-org-proj-view', () => {
      if (!WA.org || !WA.org.projectView) return orgOut({ ok: false, reason: 'module-missing' }, true);
      let v = null; try { v = WA.org.projectView(orgVal('#wa-org-kind')); } catch (e) { return orgOut({ ok: false, reason: 'project-throw' }, true); }
      if (!v || !v.ok) return orgOut({ ok: false, reason: (v && v.reason) || 'project-unavailable' }, true);
      const open = v.projects.filter(function (p) { return p.live; });
      const miss = v.projects.filter(function (p) { return p.missing.length; });
      // 逐项目独立标档：精确档给刻数、叙事档给词、两样都没记**不给词**（不印 null）。
      const tail = v.projects.map(function (p) {
        const spec = p.covered.filter(function (x) { return x.need !== null; });
        const narr = p.covered.filter(function (x) { return x.need === null; });
        const seg = (spec.length ? spec.map(function (x) { return x.item + x.covered + '/' + x.need; }).join('+') : '')
          + (narr.length ? (spec.length ? '+' : '') + narr.map(function (x) { return x.item + (x.tierWord || '未记数量'); }).join('+') : '')
          + (p.canClose ? ':ready' : ':partial');
        return p.what + '(' + p.status + ',' + seg + ')';
      }).join(' ');
      const text = '项目 · ' + v.faction + ' · 未结项 ' + open.length + ' · 有缺口 ' + miss.length
        + ' · 档位 ' + (v.tier === 'narrative' ? '叙事' : (v.tier === 'precise' ? '精确' : '未知（未记数量）'))
        + (tail ? ' — ' + tail : '');
      const o = $('#wa-org-out');
      panelEl.dataset.orgOut = text;
      if (o) o.textContent = text;
    });
    on('#wa-org-proj-close', () => {
      if (!WA.org || !WA.org.closeProject) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.org.closeProject(orgVal('#wa-org-kind'), orgVal('#wa-org-project'));
      // 缺口照实印（逐项 item:gap），不把「差一点」写成「完成」；
      //   只记了档位词没记刻数的项**不能算满足**，另印 need?（不以缺口 0 冒充备齐）。
      orgOut(Object.assign({}, r, { id: r.ok ? ('closed:' + r.what)
        : (r.reason === 'shortfall'
          ? ('short:' + (r.missing || []).map(function (x) { return x.item + x.gap; }).join('+')
            + ((r.unrecorded || []).length ? ('|need?' + r.unrecorded.map(function (x) { return x.item; }).join('+')) : ''))
          : r.id) }), true);
      renderBody();
    });
    on('#wa-org-owe', () => {
      if (!WA.org || !WA.org.oweTo) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.org.oweTo(orgVal('#wa-org-kind'), orgVal('#wa-org-person') || orgVal('#wa-org-name'),
        // 原因**不回落成「未注明」**：引擎侧 missing-why 守得住「没原因不许登记」，
        //   但壳若替人补一个原因，那道闸在真实使用里就永远不触发。
        { item: orgVal('#wa-org-item'), amount: orgVal('#wa-org-qty'), why: orgVal('#wa-org-why') });
      orgOut(Object.assign({}, r, { id: r.ok ? (r.person + '→' + r.faction + ':' + r.item + r.amount) : r.id }), true);
      renderBody();
    });
    on('#wa-org-debt-settle', () => {
      if (!WA.org || !WA.org.settleDebt) return orgOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.org.settleDebt(orgVal('#wa-org-kind'), orgVal('#wa-org-person') || orgVal('#wa-org-name'), { item: orgVal('#wa-org-item') });
      // 只还得起的量：余额照实留着（partial 与 settled 分开印）。
      orgOut(Object.assign({}, r, { id: r.ok ? ((r.settled ? 'cleared:' : 'partial:') + r.paid + ':' + r.left) : r.id }), true);
      renderBody();
    });
    on('#wa-org-debts', () => {
      if (!WA.org || !WA.org.debtsView) return orgOut({ ok: false, reason: 'module-missing' }, true);
      let v = null; try { v = WA.org.debtsView(orgVal('#wa-org-kind'), orgVal('#wa-org-person') || orgVal('#wa-org-name')); } catch (e) { return orgOut({ ok: false, reason: 'debts-throw' }, true); }
      if (!v || !v.ok) return orgOut({ ok: false, reason: (v && v.reason) || 'debts-unavailable' }, true);
      // 双向分开印：应收 / 应付各一条，不做净额。
      const text = '债务 · ' + v.kind + ':' + v.name + ' · 应收 ' + v.receivableTotal + ' · 应付 ' + v.payableTotal
        + ' · 明细 ' + v.count + ' 条（逐条带对象与原因，不抵净额）';
      const o = $('#wa-org-out');
      panelEl.dataset.orgOut = text;
      if (o) o.textContent = text;
    });
    on('#wa-org-check', () => { if (!WA.org) return orgOut({ ok: false, reason: 'module-missing' }, true); const ok = WA.org.canAfford(orgVal('#wa-org-kind'), orgVal('#wa-org-name'), orgVal('#wa-org-item'), orgVal('#wa-org-qty')); const st = WA.org.stat(); orgOut({ ok: ok, id: (ok ? 'affordable' : 'insufficient') + ':' + st.blocked, reason: ok ? '' : 'insufficient' }, true); });
    // v2.117.0（计划二 B6）：配方面三枚 + 机会面三枚。三面同批（渲染 + 绑定 + 守卫登记）——
    //   缺一面，新出口上的「绑错了 id」就没人发现。
    const recVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const recOut = function (r, keep) {
      const text = r && r.ok ? ('配方 ' + (r.id || r.reason || 'ok')) : ('未生效：' + ((r && r.reason) || '未知原因'));
      if (keep) panelEl.dataset.recOut = text;
      const o = $('#wa-rec-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.recOut) { const saved = $('#wa-rec-out'); if (saved) saved.textContent = panelEl.dataset.recOut; }
    on('#wa-rec-view', () => {
      if (!WA.recipe) return recOut({ ok: false, reason: 'module-missing' }, true);
      const name = recVal('#wa-rec-name');
      // 未填配方名 ⇒ 报当前档（**不替人挑一张**）；填了则报该配方的预览与冲突。
      if (!name) {
        const v = WA.recipe.statView();
        const cat = WA.recipe.catalogView ? WA.recipe.catalogView() : null;
        const text = '配方 · 当前：' + (v.name || '（未生效）') + ' · 可选 ' + v.known.length + ' 张'
          + ' · 静态漂移 ' + (v.staleness.total || 0)
          + ' · 基础事实 落空 ' + ((v.basicsStale || []).length ? v.basicsStale.join('/') : '无')
          + ' / 未核 ' + ((v.basicsUnverified || []).length ? v.basicsUnverified.join('/') : '无')
          + (cat ? (' · 题材叠加冲突 ' + cat.themeClash.length + ' 条') : '');
        panelEl.dataset.recOut = text;
        const o = $('#wa-rec-out'); if (o) o.textContent = text;
        return;
      }
      let v = null; try { v = WA.recipe.preview(name); } catch (e) { return recOut({ ok: false, reason: 'preview-throw' }, true); }
      if (!v || !v.ok) return recOut({ ok: false, reason: (v && v.reason) || 'preview-unavailable' }, true);
      // 冲突只报不改：这一行只印「这么配会发生什么」，决定权在调用方。
      const cl = (v.clashes.themes.length + v.clashes.policies.length);
      const text = '配方预览 · ' + v.name + '（' + v.cn + '）· 题材 ' + v.requires.themes.join('+')
        + ' · 政策 ' + v.policies.length + ' 条 · 冲突 ' + cl + ' 条'
        + ' · 动作词汇 ' + v.kinds.length + ' 项 · 场景 ' + v.scenes.length + ' 条 · 基础事实 落空 '
        + ((v.basicsStale || []).length ? v.basicsStale.join('/') : '无')
        + ' / 未核 ' + ((v.basicsUnverified || []).length ? v.basicsUnverified.join('/') : '无')
        + ' · 未写盘（预览）';
      panelEl.dataset.recOut = text;
      const o = $('#wa-rec-out'); if (o) o.textContent = text;
    });
    on('#wa-rec-seed', () => {
      if (!WA.recipe) return recOut({ ok: false, reason: 'module-missing' }, true);
      let r = null; try { r = WA.recipe.seed(recVal('#wa-rec-name')); } catch (e) { return recOut({ ok: false, reason: 'seed-throw' }, true); }
      // 取用制：不调 seed 就一个字节都不进上下文；这条回执是它被取用的唯一痕迹。
      recOut(Object.assign({}, r, { id: r.ok ? (r.scene.id + ':' + r.index + '/' + r.count) : r.id }), true);
    });
    on('#wa-opp-run', () => {
      if (!WA.opportunity) return recOut({ ok: false, reason: 'module-missing' }, true);
      let r = null; try { r = WA.opportunity.sweep(); } catch (e) { return recOut({ ok: false, reason: 'sweep-throw' }, true); }
      recOut(Object.assign({}, r, { id: r.ok ? ('formed:' + r.formed + ':' + r.added + ':' + r.active) : r.id }), true);
      renderBody();
    });
    on('#wa-opp-view', () => {
      if (!WA.opportunity) return recOut({ ok: false, reason: 'module-missing' }, true);
      const v = WA.opportunity.statView();
      const act = WA.opportunity.list ? WA.opportunity.list() : [];
      // 在途窗口逐条带「涉及谁」；涉及者未记录就印「未记录」，不猜一个人名填上。
      const rows = act.slice(0, 6).map(function (x) {
        return x.id + '(' + x.sourceLabel + ',' + x.stage + ',' + (x.actors.length ? x.actors.join('/') : '未记录') + ')';
      }).join(' ');
      const text = '机会 · 在途 ' + v.active + ' · 总 ' + v.total + ' · 扫 ' + v.sweeps + ' 次'
        + ' · 作废 ' + v.lapsed + ' · 重开 ' + v.reopens + ' · 拒收 ' + v.refused + (rows ? ' — ' + rows : '');
      panelEl.dataset.recOut = text;
      const o = $('#wa-rec-out'); if (o) o.textContent = text;
    });
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
    // v2.142.0（D2 收口）：`intel.project` / `intel.correct` 的真读者**就在这** ——
    //   用户输入的人物与事由是真输入，读数落在既有 `wa-intel-out` 节点上（与 X4 的
    //   auditRecord ← 面板「看卷宗」同款口径：「能力申报」不算读者）。
    on('#wa-intel-project', () => {
      if (!WA.intel || !WA.intel.project) return intelOut({ ok: false, reason: 'module-missing' }, true);
      const person = intelVal('#wa-intel-person'), about = intelVal('#wa-intel-effect');
      const r = WA.intel.project(about, person);
      if (!r.ok) return intelOut({ ok: false, reason: r.reason || '未知原因' }, true);
      // 两态严格分开：`ok:true` 是「查得出来」；`entitled:false` 是**查得出来、但他没资格听**。
      intelOut({ ok: true, id: r.person + '·' + r.about + ' ⇒ '
        + (r.entitled
          ? ((r.knows ? '知道得对' : '说法与真相不符') + '（听过 ' + r.seen.length + ' 条，猜错 ' + r.guessed.length + ' 条）')
          : ('无资格听真相（手上有 ' + r.withheld + ' 条，只报条数）')) + '：' + r.reason }, true);
    });
    on('#wa-intel-correct', () => {
      if (!WA.intel || !WA.intel.correct) return intelOut({ ok: false, reason: 'module-missing' }, true);
      const r = WA.intel.correct(intelVal('#wa-intel-person'), { about: intelVal('#wa-intel-effect'),
        claim: intelVal('#wa-intel-claim'), right: intelVal('#wa-intel-source'), source: intelVal('#wa-intel-source') });
      intelOut(r.ok ? { ok: true, id: '已更正 ' + r.corrected + ' 条旧说法（' + r.about + '）' } : r, true);
    });
    on('#wa-intel-add', () => { if (!WA.intel) return intelOut({ ok: false, reason: 'module-missing' }, true); const person = intelVal('#wa-intel-person'); const r = WA.intel.addIntel(person, { claim: intelVal('#wa-intel-claim'), source: intelVal('#wa-intel-source'), level: 'report', about: intelVal('#wa-intel-effect') }); const seen = r.ok ? WA.intel.visibleTo(person, intelVal('#wa-intel-effect')) : []; intelOut(Object.assign({}, r, { id: r.ok ? (r.status + ':' + seen.length + ':' + ((seen[0] && WA.intel.CONFIDENCE[seen[0].level]) || '')) : r.id }), true); renderBody(); });
    // v2.140.0（F1）：防全知闸门。三枚控件都是 noesis 的真消费方（裁决 / 扫描 / 读数）。
    //   口径与引擎同源：只读世界不改世界；泄露扫描只留痕不删文；四码分开报不合并。
    const noeVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const noeOut = function (text, keep) {
      if (keep) panelEl.dataset.noeOut = text;
      const o = $('#wa-noe-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.noeOut) { const saved = $('#wa-noe-out'); if (saved) saved.textContent = panelEl.dataset.noeOut; }
    { const el = $('#wa-noe-enabled');
      if (el) el.onchange = function () {
        if (!WA.noesis) return noeOut('未记录：module-missing', true);
        WA.noesis.setSettings({ enabled: !!el.checked });
        noeOut('已记录 ' + (el.checked ? 'enabled' : 'disabled'), true);
      }; }
    on('#wa-noe-knows', () => {
      if (!WA.noesis || !WA.noesis.knows) return noeOut('未记录：module-missing', true);
      const r = WA.noesis.knows(noeVal('#wa-noe-person'), noeVal('#wa-noe-fact'));
      if (!r.ok) return noeOut('未记录：' + (r.reason || '未知原因'), true);
      const verdict = r.known === true ? '知道' : (r.known === false ? '不该知道' : '未登记');
      noeOut('裁决：' + r.person + ' 「' + r.fact + '」⇒ ' + verdict + '（' + r.reason + '）'
        + (r.deniedBy && r.deniedBy.length ? ' · 否决源：' + r.deniedBy.join('、') : '')
        + (r.knownBy && r.knownBy.length ? ' · 知情源：' + r.knownBy.join('、') : ''), true);
    });
    on('#wa-noe-scan', () => {
      if (!WA.noesis || !WA.noesis.leakScan) return noeOut('未记录：module-missing', true);
      const p = noeVal('#wa-noe-person'), f = noeVal('#wa-noe-fact');
      if (!p || !f) return noeOut('未记录：missing-fields（人物与秘密名都要填，逐条核）', true);
      const r = WA.noesis.leakScan([{ person: p, factId: f, uttered: true }]);
      noeOut(r.count ? ('穿帮留痕 ' + r.count + ' 处：' + r.leaks.map(function (x) { return x.person + ' 说出了「' + x.fact + '」（' + x.reason + '）'; }).join('；') + ' · 只留痕不删文')
        : '未发现穿帮（' + p + ' 对「' + f + '」的知情边界成立）', true);
    });
    on('#wa-noe-boundary', () => {
      if (!WA.noesis || !WA.noesis.boundary) return noeOut('未记录：module-missing', true);
      // v2.140.0（F1）：本枚原名「边界读数」——它只读 boundary()，于是**两道辅助闸的开关位
      //   在面板上完全不可见**：感知半径与时点闸真关还是真开，只能靠引擎读数去猜。现同时
      //   读 stat() 的设置三态 —— stat 因此有了一个**独立于 boundary 的外部消费方**
      //   （「无独立消费方不挂导出」是本仓硬纪律；只在 boundary 内部被调用不算外部消费方，
      //   那正是本版被 dead-export-gate 记为 self-only 的那一项）。
      const b = WA.noesis.boundary();
      const st = (typeof WA.noesis.stat === 'function') ? WA.noesis.stat() : {};
      const on = (b.sources || []).filter(function (s) { return s.loaded; }).map(function (s) { return s.key; });
      noeOut('防全知：' + (b.enabled ? '开' : '关') + ' · 在把门 ' + on.length + '/4 源（' + (on.join('、') || '无') + '）'
        + ' · 裁决 ' + b.knows + '（准 ' + b.allows + ' / 否 ' + b.denies + '）· 扫描 ' + b.scans + ' · 穿帮留痕 ' + b.leaks
        + ' · 闸位：感知半径 ' + (st.rangeEnabled ? '开' : '关') + ' / 时点 ' + (st.timeEnabled ? '开' : '关') + ' / 穿帮上限 ' + st.maxLeaks + ' 条', true);
    });
    // v2.140.0（F1）：生成前闸门与感知半径两枚 —— gateScene / perceive 的真消费方。
    //   同 v2.121.0（P1）的规格：新增导出必须接真消费方（无独立消费方不挂导出，
    //   只在测试里活的导出不算交付）；UI_BINDINGS 就是这两处消费方的接线真源。
    //   两者共用上方「人物 / 事实」两个输入框：人物与事实各支持多个（用「、」分隔）。
    on('#wa-noe-gate', () => {
      if (!WA.noesis || !WA.noesis.gateScene) return noeOut('未记录：module-missing', true);
      const ps = noeVal('#wa-noe-person').split(/[\u3001,\uff0c]/).map(function (x) { return x.trim(); }).filter(function (x) { return !!x; });
      const fs2 = noeVal('#wa-noe-fact').split(/[\u3001,\uff0c]/).map(function (x) { return x.trim(); }).filter(function (x) { return !!x; });
      if (!ps.length || !fs2.length) return noeOut('未记录：missing-fields（人物与事实各填至少一个，多个用「、」分隔）', true);
      const g = WA.noesis.gateScene(ps, fs2);
      if (!g.ok) return noeOut('未记录：' + (g.reason || '未知原因'), true);
      noeOut('生成前闸门：' + g.persons + ' 人 × ' + g.facts + ' 事 ⇒ ' + (g.allow ? '全放行' : ('拦下 ' + g.blocked.length + ' 条'))
        + (g.blocked.length ? '：' + g.blocked.map(function (x) { return x.person + ' 不该知道「' + x.fact + '」（' + x.reason + '）'; }).join('；') : '')
        + ' · 只报不改正文', true);
    });
    on('#wa-noe-perceive', () => {
      if (!WA.noesis || !WA.noesis.perceive) return noeOut('未记录：module-missing', true);
      const p = noeVal('#wa-noe-person'), pid = noeVal('#wa-noe-fact');
      if (!p || !pid) return noeOut('未记录：missing-fields（人物与地点名都要填）', true);
      const r = WA.noesis.perceive(p, pid);
      if (!r.ok) return noeOut('未记录：' + (r.reason || '未知原因'), true);
      const word = r.range === 'present' ? '在场' : (r.range === 'out' ? '不可达' : (r.range === 'impaired' ? '在场但没注意到' : '未知'));
      noeOut('感知半径：' + p + ' 对「' + pid + '」⇒ ' + word + (r.reason ? '（' + r.reason + '）' : '')
        + (r.via ? ' · 依据：' + r.via : ''), true);
    });
    // v2.143.0（F4）：在岗闸门 —— duty() 的真消费方。
    //   三态口径与引擎同源：**不回落成「在岗」**；两码不合并（off-duty 等排班 / not-in-office 走任职流程）；
    //   本枚只答「在不在岗」，不答「知不知道」（人下班了，知道的事不会忘 —— 那是另一个真源）。
    //   组织名走「事实」输入框（与其余五枚共用），不是新造一个控件：本闸门的锚点是**组织**不是事实。
    on('#wa-noe-duty', () => {
      if (!WA.noesis || !WA.noesis.duty) return noeOut('未记录：module-missing', true);
      const p = noeVal('#wa-noe-person'), org = noeVal('#wa-noe-fact');
      if (!p || !org) return noeOut('未记录：missing-fields（人物与组织名都要填；本闸门问的是「他在这个组织中在不在岗」）', true);
      const r = WA.noesis.duty(p, org);
      if (r.known !== true) return noeOut('无话可说：任职面缺席（' + p + ' 在该组织无任职记录，或该组织查不到）'
        + ' —— 「查不到」不等于「不在岗」，故如实报缺席而不是替他答一个', true);
      const word = r.onDuty === true ? '在岗' : (r.reason === 'off-duty' ? '在职但不在岗' : '不在职');
      noeOut('在岗闸门：' + p + ' 在「' + org + '」⇒ ' + word + '（' + r.reason + '）'
        + (r.reason === 'off-duty' ? ' · 被日程占住（' + (r.via || '') + '）⇒ 该等排班或改日程' : '')
        + (r.reason === 'not-in-office' ? ' · 无任何在职职位 ⇒ 该先走任职流程' : '')
        + (r.posts && r.posts.length ? ' · 在职职位：' + r.posts.join('、') : '')
        + ' · 只答在不在岗，不答知不知道', true);
    });
    // v2.144.0（F5）：记忆失真核查 —— fidelity() 的真消费方。
    //   与上一枚的分工是硬的：那一枚答「知道吗」，本枚答「记的是原版吗」。
    //   三态口径与引擎同源：**不回落成「原版」**（问不出来 ≠ 是原版）；
    //   只报不改（更正记录是叙事决定，不是引擎决定 —— 与 leakScan 同规）。
    on('#wa-noe-fidelity', () => {
      if (!WA.noesis || !WA.noesis.fidelity) return noeOut('未记录：module-missing', true);
      const p = noeVal('#wa-noe-person'), f = noeVal('#wa-noe-fact');
      if (!p || !f) return noeOut('未记录：missing-fields（人物与事实名都要填）', true);
      const r = WA.noesis.fidelity(p, f);
      if (r.reason === 'fidelity-off') return noeOut('无话可说：记忆失真面这一轴已关（fidelity-off）'
        + ' —— 「这一轴没查」不等于「他记的是原版」，故如实报缺席', true);
      if (r.known !== true) return noeOut('无话可说：' + (r.reason === 'not-on-chain'
        ? '此人不在该事实的传播链上（没接到过，谈不上他手里是哪一版）'
        : '传播面缺席或这条链不存在') + ' —— 问不出来不等于问出来是原版', true);
      if (r.faithful === true) return noeOut('记忆失真核查：' + p + ' 对「' + f + '」⇒ 原版'
        + '（' + (r.layer || '') + ' 层 · 链 ' + (r.chain || '') + ' · 共 ' + r.hops + ' 跳）', true);
      noeOut('记忆失真核查：' + p + ' 对「' + f + '」⇒ **已失真**（' + r.reason + '）'
        + (r.drift ? ' · 改写：' + r.drift.from + ' → ' + r.drift.to : '')
        + (r.via ? ' · 经手动机：' + r.via : '')
        + ' · 只报不改（更正记录是叙事决定，不是引擎决定）', true);
    });
    // v2.141.0（F2）：生理与照护层。三枚写/读入口各自对上一个真出口——
    //   控件与 handler 同批（只加控件不加 handler = 点了没反应；只加 handler 不加控件 = 死代码）。
    const lfnVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const lfnOut = function (text, keep) {
      if (keep) panelEl.dataset.lfnOut = text;
      const o = $('#wa-lfn-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.lfnOut) { const saved = $('#wa-lfn-out'); if (saved) saved.textContent = panelEl.dataset.lfnOut; }
    const llSplit = function (v) {
      return String(v || '').split(/[\u3001,\uff0c]/).map(function (x) { return x.trim(); }).filter(function (x) { return !!x; });
    };
    { const el = $('#wa-lfn-enabled');
      if (el) el.addEventListener('change', function () {
        if (!WA.lifeline) return lfnOut('未记录：module-missing', true);
        WA.lifeline.setSettings({ enabled: !!el.checked });
        lfnOut('已记录 ' + (el.checked ? 'enabled' : 'disabled'), true);
      });
    }
    on('#wa-lfn-register', () => {
      if (!WA.lifeline || !WA.lifeline.register) return lfnOut('未记录：module-missing', true);
      const r = WA.lifeline.register(lfnVal('#wa-lfn-person'), lfnVal('#wa-lfn-cond'),
        { kind: lfnVal('#wa-lfn-kind'), course: 'onset', limits: llSplit(lfnVal('#wa-lfn-limits')),
          care: llSplit(lfnVal('#wa-lfn-care')), replace: true });
      if (!r.ok) return lfnOut('未记录：' + (r.reason || '未知原因'), true);
      lfnOut('已登记 ' + r.who + '「' + r.cond + '」（' + r.kind + '）⇒ ' + r.course, true);
    });
    on('#wa-lfn-advance', () => {
      if (!WA.lifeline || !WA.lifeline.advance) return lfnOut('未记录：module-missing', true);
      const r = WA.lifeline.advance(lfnVal('#wa-lfn-person'), lfnVal('#wa-lfn-cond'), lfnVal('#wa-lfn-course'));
      if (!r.ok) {
        return lfnOut('未记录：' + (r.reason || '未知原因')
          + (r.from ? '（' + r.from + ' → ' + r.to + '，程段只许前进一格或原地）' : ''), true);
      }
      lfnOut('程段：' + r.who + '「' + r.cond + '」' + r.from + ' → ' + r.to, true);
    });
    on('#wa-lfn-capacity', () => {
      if (!WA.lifeline || !WA.lifeline.capacityOf) return lfnOut('未记录：module-missing', true);
      const r = WA.lifeline.capacityOf(lfnVal('#wa-lfn-person'));
      if (!r.ok) return lfnOut('未记录：' + (r.reason || '未知原因'), true);
      if (!r.known) return lfnOut('容量：未记录（此人没有任何已登记的病况 —— 查不到，不是「他很健康」）', true);
      const ks = Object.keys(r.limits || {});
      // v2.141.0（F2）：累计读数同一条出口。`stat` 回答「这一路各阶段各几笔」，
      //   与上面的「此刻剩几项受限」是同一件事的即时面与累计面（与 act 的「看台账」同规）。
      //   faults 按拒收码分列 —— 否则「被拒过 7 次」永远说不出是哪一类被拒。
      const st = (WA.lifeline && WA.lifeline.stat) ? WA.lifeline.stat() : null;
      const fl = (st && st.faults) ? Object.keys(st.faults).map(function (k) { return k + '×' + st.faults[k]; }).join(' ') : '';
      lfnOut('容量：' + r.who + ' 受限 ' + ks.length + ' 项（' + r.band + '）：'
        + (ks.length ? ks.map(function (k) { return k + '×' + r.limits[k]; }).join('、') : '无限制登记')
        + (st ? ' · 累计 登记' + st.regs + '/推进' + st.advances + '/读' + st.reads
          + (fl ? ' · 拒收 ' + fl : '') : ''), true);
    });
    on('#wa-lfn-gap', () => {
      if (!WA.lifeline || !WA.lifeline.careGap) return lfnOut('未记录：module-missing', true);
      const r = WA.lifeline.careGap(lfnVal('#wa-lfn-person'), lfnVal('#wa-lfn-cond'));
      if (!r.ok) return lfnOut('未记录：' + (r.reason || '未知原因'), true);
      lfnOut('照护缺口：已落账 ' + r.done.length + ' 步；未落账 ' + (r.gap.length ? r.gap.join('、') : '（无）')
        + ' · 只答流程差，不写结果', true);
    });
    on('#wa-lfn-view', () => {
      if (!WA.lifeline || !WA.lifeline.view) return lfnOut('未记录：module-missing', true);
      const r = WA.lifeline.view(lfnVal('#wa-lfn-person'));
      if (!r.ok) return lfnOut('未记录：' + (r.reason || '未知原因'), true);
      if (!r.count) return lfnOut('明细：未记录（此人没有已登记的状况）', true);
      lfnOut('明细：' + r.rows.map(function (x) {
        return x.cond + '（' + x.kind + '，' + x.course + '，限制 ' + (x.limits.join('/') || '无') + '）';
      }).join('；'), true);
    });
    // v2.142.0（F3）：视角锁。六枚出口各自对上一个真出口 ——
    //   控件与 handler 同批（只加控件不加 handler = 点了没反应；只加 handler 不加控件 = 死代码）。
    const perVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const perOut = function (text, keep) {
      if (keep) panelEl.dataset.perOut = text;
      const o = $('#wa-per-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.perOut) { const saved = $('#wa-per-out'); if (saved) saved.textContent = panelEl.dataset.perOut; }
    const perSplit = function (v) {
      return String(v || '').split(/[\u3001,\uff0c]/).map(function (x) { return x.trim(); }).filter(function (x) { return !!x; });
    };
    { const el = $('#wa-per-enabled');
      if (el) el.addEventListener('change', function () {
        if (!WA.perspective) return perOut('未记录：module-missing', true);
        WA.perspective.setSettings({ enabled: !!el.checked });
        perOut('已记录 ' + (el.checked ? 'enabled' : 'disabled'), true);
      });
    }
    // 裁决类三枚共用一个读数格式化：四类拒绝**分开报**（见引擎边界 5）。
    const perWord = function (r) {
      if (r.allowed === false) {
        const w = r.reason === 'out-of-lens' ? '此人不在本视角里（补共视角，或换一个场景视角）'
          : (r.reason === 'interior-blocked' ? '内心渠道被封（' + (r.via || '') + '）' : '不许写');
        return '越界：' + w;
      }
      return '合法（' + (r.reason || '') + '）';
    };
    on('#wa-per-assign', () => {
      if (!WA.perspective || !WA.perspective.assign) return perOut('未记录：module-missing', true);
      const r = WA.perspective.assign(perVal('#wa-per-scene'), perVal('#wa-per-lens'), perSplit(perVal('#wa-per-persons')), { replace: true });
      if (!r.ok) return perOut('未记录：' + (r.reason || '未知原因')
        + (r.allowed ? '（可选视角：' + r.allowed.join('/') + '）' : ''), true);
      perOut('已登记 ' + r.scene + ' ⇒ ' + r.lens + '（视角人物 ' + r.persons.length + ' 位）', true);
    });
    on('#wa-per-current', () => {
      if (!WA.perspective || !WA.perspective.current) return perOut('未记录：module-missing', true);
      const r = WA.perspective.current(perVal('#wa-per-scene'));
      if (!r.ok) return perOut('当前视角：未记录（' + (r.reason || '未知原因') + ' —— 没登记就是没登记，不按全知写）', true);
      perOut('当前视角：' + r.scene + ' ⇒ ' + r.lens + '（视角人物 ' + r.persons.length + ' 位，历史 ' + r.history.length + ' 条）', true);
    });
    on('#wa-per-allows', () => {
      if (!WA.perspective || !WA.perspective.allows) return perOut('未记录：module-missing', true);
      const r = WA.perspective.allows({ scene: perVal('#wa-per-scene'), who: perVal('#wa-per-who'),
        channel: perVal('#wa-per-channel'), access: perVal('#wa-per-access') });
      // 两态严格分开：ok:false 是「查不出来」（缺字段 / 场景未登记 / 模块关），
      //   ok:true 才是裁决本体（allowed 可能为 false —— 那是裁决结论，不是错误）。
      if (!r.ok) return perOut('未记录：' + (r.reason || '未知原因'), true);
      perOut('裁决：' + r.who + ' / ' + r.channel + ' ⇒ ' + perWord(r), true);
    });
    on('#wa-per-leak', () => {
      if (!WA.perspective || !WA.perspective.leakScan) return perOut('未记录：module-missing', true);
      const r = WA.perspective.leakScan([{ written: true, scene: perVal('#wa-per-scene'), who: perVal('#wa-per-who'),
        channel: perVal('#wa-per-channel'), access: perVal('#wa-per-access') }]);
      if (!r.ok) return perOut('未记录：' + (r.reason || '未知原因'), true);
      perOut('越界扫描：扫 ' + r.scanned + ' 笔，检出 ' + r.count + ' 处'
        + (r.count ? '（' + r.leaks.map(function (x) { return x.who + '/' + x.reason; }).join('、') + '）' : '')
        + ' · 只留痕不删文', true);
    });
    on('#wa-per-boundary', () => {
      if (!WA.perspective || !WA.perspective.boundary) return perOut('未记录：module-missing', true);
      const b = WA.perspective.boundary();
      const st = (WA.perspective && WA.perspective.stat) ? WA.perspective.stat() : null;
      const fl = (st && st.faults) ? Object.keys(st.faults).map(function (k) { return k + '×' + st.faults[k]; }).join(' ') : '';
      perOut('视角锁：' + (b.enabled ? '开' : '关') + ' · 已登记场景 ' + b.rows + '/' + b.maxScenes
        + ' · 四类拒绝分开报 —— 不在视角 ' + b.outOfLens + '/内心封 ' + b.interiorBlocked
        + '/未登记 ' + b.noScene + '/留痕 ' + b.leaks
        + (fl ? ' · 拒收 ' + fl : ''), true);
    });
    on('#wa-per-block', () => {
      if (!WA.perspective || !WA.perspective.buildBlock) return perOut('未记录：module-missing', true);
      const t = WA.perspective.buildBlock();
      perOut(t ? ('注入块：' + t.split(String.fromCharCode(10)).length + ' 行 · 不列视角人物名（防剧透）')
        : '注入块：空（开关未开，零 token 占用）', true);
    });
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
    // ── v2.149.0（X1）：世界沉积层。五枚出口各自对上一个真出口 ——
    //   控件与 handler 同批（只加控件不加 handler = 点了没反应；只加 handler 不加控件 = 死代码）。
    //   拒绝理由**分开报**：缺地点（missing-fields）/ 缺键（missing-fields+field）/ 档位表外
    //   （bad-value+allowed）——合成一个「没记上」之后，用户答不出到底哪一项没填对。
    const sedVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const sedOut = function (text, keep) {
      if (keep) panelEl.dataset.sedOut = text;
      const o = $('#wa-sed-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.sedOut) { const saved = $('#wa-sed-out'); if (saved) saved.textContent = panelEl.dataset.sedOut; }
    const sedErr = function (r) {
      return '未记录：' + (r.reason || '未知原因')
        + (r.field ? '（' + r.field + '）' : '')
        + (r.allowed ? '（可选痕迹档：' + r.allowed.join('/') + '）' : '');
    };
    { const el = $('#wa-sed-enabled');
      if (el) el.onchange = function () {
        if (!WA.sediment || !WA.sediment.setSettings) return sedOut('未记录：module-missing', true);
        WA.sediment.setSettings({ enabled: !!el.checked });
        // 「不再注入」与「抹掉了历史」是两件事：关掉之后既有痕迹仍在存档里，明说。
        sedOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（既有痕迹保留在存档里，只是不再进正文）'), true);
      };
    }
    on('#wa-sed-settle', () => {
      if (!WA.sediment || !WA.sediment.settle) return sedOut('未记录：module-missing', true);
      const r = WA.sediment.settle(sedVal('#wa-sed-place'), { key: sedVal('#wa-sed-key'), text: sedVal('#wa-sed-text'), trace: sedVal('#wa-sed-trace') });
      if (!r.ok) return sedOut(sedErr(r), true);
      sedOut('已登记 ' + r.place + ' · ' + r.key + ' ⇒ ' + r.trace + (r.updated ? '（同键更新：痕迹只升不降）' : '（新增）') + '，此处共 ' + r.size + ' 条', true);
    });
    on('#wa-sed-feel', () => {
      if (!WA.sediment || !WA.sediment.feel) return sedOut('未记录：module-missing', true);
      const r = WA.sediment.feel(sedVal('#wa-sed-place'));
      if (!r.ok) return sedOut(sedErr(r), true);
      // absent 与「空列表」分开：查不到就说查不到，不回落成「这里什么都没发生过」。
      if (r.absent) return sedOut('此处：未记录（' + r.place + ' 没有任何痕迹 —— 「查不到」不是「什么都没有发生过」）', true);
      sedOut('此处 ' + r.place + '：共 ' + r.count + ' 条，当前最强 ' + (r.peak || '无') + '｜'
        + r.rows.map(function (x) { return x.label + '·' + (x.text || x.key) + (x.faded ? '（已淡）' : ''); }).join('；'), true);
    });
    on('#wa-sed-block', () => {
      if (!WA.sediment || !WA.sediment.buildBlock) return sedOut('未记录：module-missing', true);
      const t = WA.sediment.buildBlock(sedVal('#wa-sed-place'));
      sedOut(t ? t : '本轮不进正文（关闭 / 无地点 / 此处无痕迹 / 只剩传说档 —— 四种局面都可能是空块）', true);
    });
    on('#wa-sed-stat', () => {
      if (!WA.sediment || !WA.sediment.stat) return sedOut('未记录：module-missing', true);
      const s = WA.sediment.stat();
      const c = s.caps || {};
      sedOut('沉积台账：' + (s.enabled ? '开' : '关') + '｜地方 ' + s.places + '/' + c.places
        + ' · 痕迹 ' + s.events + '/' + c.events + '（总上限 ' + c.total + '）'
        + ' · 已降到传说档 ' + s.legends + ' 条｜登记 ' + s.settled + ' 次 / 读 ' + s.feels + ' 次 / 出块 ' + s.blocks + ' 次', true);
    });
    // v2.151.0（RX2+RX3）：跨会话记忆锚八枚 + 远方脉搏四枚。
    //   与 v2.149.0（P3+X1）的同规格：渲染 + 绑定 + 守卫登记三件齐做，
    //   否则「按钮渲染了但绑定的 id 写错」这类断裂在新出口上无人发现。
    const otVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const otOut = function (text, keep) {
      if (keep) panelEl.dataset.otOut = text;
      const o = $('#wa-ot-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.otOut) { const saved = $('#wa-ot-out'); if (saved) saved.textContent = panelEl.dataset.otOut; }
    const otErr = function (r) {
      return '未记录：' + (r.reason || '未知原因') + (r.field ? '（' + r.field + '）' : '')
        + (r.cap ? '（上限 ' + r.cap + '）' : '');
    };
    { const el = $('#wa-ot-enabled');
      if (el) el.onchange = function () {
        if (!WA.offlineTick || !WA.offlineTick.setSettings) return otOut('未记录：module-missing', true);
        WA.offlineTick.setSettings({ enabled: !!el.checked });
        // 「不再锚」与「抹掉了锚」是两件事：关掉之后既有锚仍在存档里，明说。
        otOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（既有锚保留在存档里，只是不再保护离线推演）'), true);
      };
    }
    on('#wa-ot-anchor', () => {
      if (!WA.offlineTick || !WA.offlineTick.anchor) return otOut('未记录：module-missing', true);
      const r = WA.offlineTick.anchor(otVal('#wa-ot-path'), { kind: otVal('#wa-ot-kind'), text: otVal('#wa-ot-note') });
      if (!r.ok) return otOut(otErr(r), true);
      otOut('已锚 ' + r.path + ' · ' + r.kind + (r.created ? '（新增）' : '（同路径幂等刷新）'), true);
    });
    on('#wa-ot-anchors', () => {
      if (!WA.offlineTick || !WA.offlineTick.anchorPaths) return otOut('未记录：module-missing', true);
      const ps = WA.offlineTick.anchorPaths();
      const st = (typeof WA.offlineTick.stat === 'function') ? WA.offlineTick.stat() : {};
      otOut(ps.length ? '在场锚 ' + ps.length + '/' + ((st.caps || {}).anchors || '-') + '：' + ps.join('、')
                      : '无在场锚（离线推演不保护任何路径；「没登记过」不是「不必保护」）', true);
    });
    on('#wa-ot-release', () => {
      if (!WA.offlineTick || !WA.offlineTick.release) return otOut('未记录：module-missing', true);
      const r = WA.offlineTick.release(otVal('#wa-ot-path'));
      if (!r.ok) return otOut(otErr(r), true);
      otOut('已释放 ' + r.path + '（行保留为已释放——「曾经锚过」是复盘材料）', true);
    });
    on('#wa-ot-tick', () => {
      if (!WA.offlineTick || !WA.offlineTick.tick) return otOut('未记录：module-missing', true);
      let r = null;
      // **必须在事务里调用**（与本模块边界一致：它只改 draft.offlineTick，自己不开事务）。
      //   本枚不接 apply：面板不替世界推演（推进由既有引擎负责），故如实报 no-apply。
      WA.store.transact(function (d) { r = WA.offlineTick.tick(d, { now: clockNow('ui.offlineTick') }); }, 'ui:offlineTick');
      if (!r || !r.ok) return otOut(otErr(r || { reason: 'store-unavailable' }), true);
      if (r.first) return otOut('已落基准（首次调用不结算：「不知道你走了多久」不等于「你走了零秒」）', true);
      otOut('离线 ' + r.elapsedMs + 'ms ⇒ ' + r.rounds + ' 轮'
        + (r.capped ? '（已按上限截断）' : '') + ' · 保护跳过 ' + r.protectedRows + ' 行'
        + (r.reason ? '（' + r.reason + '）' : ''), true);
    });
    on('#wa-ot-summary', () => {
      if (!WA.offlineTick || !WA.offlineTick.summary) return otOut('未记录：module-missing', true);
      const r = WA.offlineTick.summary();
      if (!r.ok) return otOut(otErr(r), true);
      otOut(r.lines.join(' '), true);
    });
    on('#wa-ot-block', () => {
      if (!WA.offlineTick || !WA.offlineTick.buildBlock) return otOut('未记录：module-missing', true);
      const t = WA.offlineTick.buildBlock();
      otOut(t ? t : '本轮不进正文（关闭 / 无批次 / 无内容 —— 三种局面都可能是空块）', true);
    });
    on('#wa-ot-stat', () => {
      if (!WA.offlineTick || !WA.offlineTick.stat) return otOut('未记录：module-missing', true);
      const s = WA.offlineTick.stat();
      const c = s.caps || {};
      otOut('离线台账：' + (s.enabled ? '开' : '关') + '｜锚 ' + s.anchors + '/' + c.anchors
        + '（已释放 ' + s.released + '）· 批次 ' + s.batches + '/' + c.batches
        + ' · 跳过 ' + s.skips + '/' + c.skips + '｜结算 ' + s.ticks + ' 次 / 落基准 ' + s.firsts
        + ' 次 / 共 ' + s.rounds + ' 轮 · 保护行 ' + s.protectedRows, true);
    });
    // v2.156.0（SP1+S1）：游玩活动基准三枚 + 离线恢复编排三枚（含共用输出区）。
    //   与 v2.151.0 / v2.153.0 同规格：渲染 + 绑定 + 守卫登记三件齐做，
    //   否则「按钮渲染了但绑定的 id 写错」这类断裂在这批控件上永不可见。
    const orOut = function (text, keep) {
      if (keep) panelEl.dataset.orOut = text;
      const o = $('#wa-or-out'); if (o) o.textContent = text;
    };
    if (panelEl.dataset.orOut) { const saved = $('#wa-or-out'); if (saved) saved.textContent = panelEl.dataset.orOut; }
    { const el = $('#wa-pt-enabled');
      if (el) el.onchange = function () {
        if (!WA.playtime || !WA.playtime.setSettings) return orOut('未记录：module-missing', true);
        WA.playtime.setSettings({ enabled: !!el.checked });
        // 「不再记」与「抹掉了基准」是两件事：关掉之后既有基准仍在盘上，明说。
        orOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（既有活动基准保留在盘上，只是不再更新）'), true);
      };
    }
    on('#wa-pt-read', () => {
      if (!WA.playtime || !WA.playtime.lastActive) return orOut('未记录：module-missing', true);
      const names = (WA.playtime.SOURCE_NAMES || []).join('／');
      const r = WA.playtime.lastActive();
      // 「从没记过」（no-baseline）与「读存储失败」（readFails > 0）是两件事，分开报。
      if (!r.ok) {
        const st = (typeof WA.playtime.stat === 'function') ? WA.playtime.stat() : {};
        return orOut('基准读回：' + r.reason + '（' + (r.chatId || '-') + '）'
          + ((st.readFails > 0) ? ' · 本会话读失败 ' + st.readFails + ' 次（这是存储故障，不是「没记过」）'
            : '（本聊天尚未记过——「没记过」不等于「你走了零秒」）')
          + '｜四种时间：' + names, true);
      }
      orOut('基准读回（纯读，未推进）：' + r.chatId + ' @ ' + r.at + '，距今 ' + r.ageMs + 'ms · 累计更新 ' + r.updates
        + ' 次｜四种时间：' + names, true);
    });
    on('#wa-pt-touch', () => {
      if (!WA.playtime || !WA.playtime.touch) return orOut('未记录：module-missing', true);
      const r = WA.playtime.touch({ force: true });
      if (!r.ok) return orOut(otErr(r), true);
      orOut(r.updated ? ('已更新基准：' + r.chatId + ' @ ' + r.at + '（第 ' + r.updates + ' 次）')
        : ('未推进：throttled（距上次活动不足 updateMinMs，基准仍在 ' + r.at + '）—— 节流是频率闸，不是失败'), true);
    });
    { const el = $('#wa-or-enabled');
      if (el) el.onchange = function () {
        if (!WA.offlineReturn || !WA.offlineReturn.setSettings) return orOut('未记录：module-missing', true);
        WA.offlineReturn.setSettings({ enabled: !!el.checked });
        orOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（既有票据与台账保留，只是不再自动恢复）'), true);
      };
    }
    on('#wa-or-recover', () => {
      if (!WA.offlineReturn || !WA.offlineReturn.recover) return orOut('未记录：module-missing', true);
      const r = WA.offlineReturn.recover({ trigger: 'panel' });
      if (!r.ok) return orOut(otErr(r), true);
      if (r.first) return orOut('已落基准（首见这个聊天没有活动基准：「不知道你走了多久」不等于「你走了零秒」）', true);
      orOut('恢复：' + r.reason + (isFinite(r.gapMs) ? '（离线 ' + r.gapMs + 'ms）' : '')
        + (r.rounds ? ' · 推进 ' + r.rounds + ' 轮' : '')
        + (r.protectedRows ? ' · 保护跳过 ' + r.protectedRows + ' 行' : ''), true);
    });
    on('#wa-or-stat', () => {
      if (!WA.offlineReturn || !WA.offlineReturn.stat) return orOut('未记录：module-missing', true);
      const s = WA.offlineReturn.stat();
      orOut('恢复台账：' + (s.enabled ? '开' : '关') + '｜恢复 ' + s.recovers + ' 次 / 跳过 ' + s.skips
        + ' / 失败 ' + s.fails + '（重试 ' + s.retries + '）· 票据复核 ' + s.ticketChecks
        + '（其中陈旧 ' + s.staleTickets + '）｜最近 ' + (s.lastReason || '-'), true);
    });
    on('#wa-ff-stat', () => {
      if (!WA.farfield || !WA.farfield.stat) return otOut('未记录：module-missing', true);
      const s = WA.farfield.stat();
      const c = s.caps || {};
      otOut('远方脉搏：' + (s.enabled ? '开' : '关') + (s.autoOn ? '／自动推进开' : '') + '｜近场 ' + s.nearCount + ' / 远场 ' + s.farCount
        + ' 处 · 大事记 ' + s.pulses + '/' + c.pulses + '（推演上限 ' + c.autoMaxWindows + '）· 在途 ' + s.pendingInFlight + '/' + c.pending
        + ' · 已传到近场 ' + s.heard + '/' + c.heard + '（失真 ' + s.distorted + '）｜转移包容量 ' + c.transfer
        + '｜推进 ' + s.ticks + ' 次 · 投递 ' + s.delivered
        + '｜预算没推完 ' + (s.carriedOnce || 0) + ' 次 · 在途满暂停 ' + (s.pendingFull || 0) + ' 次'
        + '｜自动 ' + (s.autoTicks || 0) + ' 次（首调 ' + (s.autoFirsts || 0) + '）', true);
    });
    on('#wa-ff-partition', () => {
      if (!WA.farfield || !WA.farfield.partition) return otOut('未记录：module-missing', true);
      const p = WA.farfield.partition();
      otOut('分区（划分线 ' + p.nearDays + ' 天）：近场 ' + p.near.length + ' 处'
        + (p.near.length ? '（' + p.near.map(function (x) { return x.name; }).join('、') + '）' : '')
        + ' · 远场 ' + p.far.length + ' 处'
        + (p.far.length ? '（' + p.far.map(function (x) { return x.name; }).join('、') + '）' : '')
        + '；已报备 ' + p.known + ' 处（远场是简化的：只记大势，不替远方编人名与明细）', true);
    });
    on('#wa-ff-pending', () => {
      if (!WA.farfield || !WA.farfield.pending) return otOut('未记录：module-missing', true);
      const p = WA.farfield.pending();
      otOut(p.count ? '在途 ' + p.count + ' 条：' + p.rows.map(function (m) {
        return m.place + '·' + m.trend + '（延迟 ' + m.delayDays + ' 天）';
      }).join('；') + '。未到期的不许提前落地——提前落地等于把距离抹平' : '无在途传闻（远场还静着）', true);
    });
    { const el = $('#wa-ff-auto');
      if (el) el.onchange = function () {
        if (!WA.farfield || !WA.farfield.setSettings) return otOut('未记录：module-missing', true);
        WA.farfield.setSettings({ auto: !!el.checked });
        otOut('已记录 auto=' + (el.checked ? 'on' : 'off') + '（总开关另有其开关：关着时自动也不跑）');
      };
    }
    on('#wa-ff-tick', () => {
      if (!WA.farfield || !WA.farfield.auto) return otOut('未记录：module-missing', true);
      let r = null;
      try {
        WA.store.transact(function (draft) { r = WA.farfield.auto(draft, {}); }, 'farfield:auto-panel');
      } catch (e) { return otOut('推进失败：' + ((e && e.message) || e), true); }
      if (!r || !r.ok) return otOut('未推进：' + ((r && r.reason) || 'unknown') + '（关闭 / auto 未开 / 无世界钟 / 剧情日没动，四者分列）', true);
      otOut('自动推进：剧情日 ' + r.from + ' → ' + r.day + (r.first ? '（首调只落起点）' : '')
        + '｜本步窗口 ' + r.windows + (r.budget ? '（剩 ' + r.budget.carried + ' 未处理）' : '')
        + ' · 新脉搏 ' + r.pulses + ' · 落地 ' + r.delivered + (r.held ? ' · 封路扣留 ' + r.held : '') + '｜游标 ' + r.to, true);
    });
    on('#wa-ff-transfer', () => {
      if (!WA.farfield || !WA.farfield.transferPack) return otOut('未记录：module-missing', true);
      const r = WA.farfield.transferPack({});
      otOut(r.ok ? ('转移包 ' + r.count + '/' + r.cap + ' 条' + (r.count ? '：' + r.rows.map(function (x) { return x.place + '·' + x.said; }).join('；') : '（近场还没有远方消息）')
        + '｜在途 ' + r.inFlight + ' 条不进包')
        : ('打包拒收：' + r.reason + (r.cap ? '（上限 ' + r.cap + '，要 ' + r.wanted + '）' : '')), true);
    });
    { const el = $('#wa-ff-enabled');
      if (el) el.onchange = function () {
        if (!WA.farfield || !WA.farfield.setSettings) return otOut('未记录：module-missing', true);
        WA.farfield.setSettings({ enabled: !!el.checked });
        // 「不再推进」与「远场停了」是两件事：关掉后既有大事记与在途传闻仍在存档里。
        otOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（既有大事记与在途传闻保留在存档里，只是不再推进）'), true);
      };
    }
    // ── v2.152.0（RP6/RP7）：性能与水位段（与 offline 页共用输出区）──
    const rpOut = function (text) { setOut('#wa-rp-out', text); };
    on('#wa-rp-stat', () => {
      if (!WA.renderPerf || !WA.renderPerf.renderStat) return rpOut('未记录：module-missing');
      const s = WA.renderPerf.renderStat();
      rpOut(s.pages ? '渲染读数：' + s.pages + ' 页 · ' + s.observed + ' 次 · 拒收 ' + s.rejected
        + '｜' + s.rows.slice(0, 8).map(function (r) {
          return r.page + ' ' + r.renders + '次/' + r.avgMs + 'ms' + (r.avgNodes !== null ? '/' + r.avgNodes + '控件' : '');
        }).join('；') : '还没有渲染读数（先切几次页）');
    });
    on('#wa-rp-trend', () => {
      if (!WA.renderPerf || !WA.renderPerf.renderTrend) return rpOut('未记录：module-missing');
      const t = WA.renderPerf.renderTrend();
      rpOut(t.rows.length ? t.basis + '｜' + t.rows.slice(0, 8).map(function (r) {
        return r.page + ' 近10=' + r.short + ' / 近50=' + r.mid + ' / 全窗=' + r.full;
      }).join('；') : '还没有渲染趋势（先切几次页）');
    });
    on('#wa-rp-reset', () => {
      // v2.152.0：两条观测链的 reset 在这里合用一个入口。为什么合用而不是各给一个：
      //   它们清的是同一类东西（进程态观测环），且「重新量一遍」这个动作天然成对
      //   （渲染样本被清而存储样本留着，会得到一条跨了两代的趋势）。任一侧缺席时如实报哪侧缺席。
      const missing = [];
      if (!(WA.renderPerf && WA.renderPerf.reset)) missing.push('renderPerf');
      if (!(WA.storageForecast && WA.storageForecast.reset)) missing.push('storageForecast');
      if (missing.length) return rpOut('未清空：module-missing（' + missing.join('、') + '）');
      WA.renderPerf.reset();
      WA.storageForecast.reset();
      rpOut('观测环已清空：渲染样本与存储样本都回到 0。存档与配置未动（只清进程态读数）');
    });
    { const el = $('#wa-rp-enabled');
      if (el) el.onchange = function () {
        if (!WA.renderPerf || !WA.renderPerf.setSettings) return rpOut('未记录：module-missing');
        WA.renderPerf.setSettings({ enabled: !!el.checked });
        rpOut('已记录 ' + (el.checked ? 'enabled（从此每次重绘入账）' : 'disabled（已入账的读数保留，只是不再记新的）'));
      };
    }
    { const el = $('#wa-sf-enabled');
      if (el) el.onchange = function () {
        if (!WA.storageForecast || !WA.storageForecast.setSettings) return rpOut('未记录：module-missing');
        WA.storageForecast.setSettings({ enabled: !!el.checked });
        rpOut('已记录 ' + (el.checked ? 'enabled（下一轮结算后开始采样）' : 'disabled（已采样本保留在内存环里，只是不再采）'));
      };
    }
    on('#wa-sf-sample', () => {
      if (!WA.storageForecast || !WA.storageForecast.sample) return rpOut('未记录：module-missing');
      const r = WA.storageForecast.sample();
      rpOut(r.ok ? '样本已入账：第 ' + r.round + ' 轮 · ' + r.bytes + ' 字节 · 环内 ' + r.count + ' 条'
        : '未入账：' + r.reason + (r.need ? '（需 ≥' + r.need + ' 条）' : ''));
    });
    on('#wa-sf-forecast', () => {
      if (!WA.storageForecast || !WA.storageForecast.forecast) return rpOut('未记录：module-missing');
      const r = WA.storageForecast.forecast();
      if (!r.ok) return rpOut('未预测：' + r.reason + (r.need ? '（样本 ' + r.samples + '/' + r.need + '）' : ''));
      rpOut('水位预测：' + r.samples + ' 样本 · 窗口 ' + r.windowRounds + ' 轮 · 增速 ' + r.slopeBytesPerRound
        + ' B/轮 · 当前 ' + r.lastBytes + ' B｜' + r.rows.map(function (x) {
          return (x.level * 100) + '%=' + (x.inRounds === null ? '到不了' : x.inRounds + '轮');
        }).join('；') + '（' + r.note + '）');
    });
    on('#wa-sf-stat', () => {
      if (!WA.storageForecast || !WA.storageForecast.stat) return rpOut('未记录：module-missing');
      const s = WA.storageForecast.stat();
      rpOut('水位台账：' + (s.enabled ? '开' : '关') + '｜样本环 ' + s.samplesInRing + '/' + s.cap
        + '（第 ' + s.firstRound + '–' + s.lastRound + ' 轮）· 预测 ' + s.forecasts + ' 次'
        + ' · 拒收 ' + s.rejected + (s.lastReason ? '（最近：' + s.lastReason + '）' : ''));
    });
    // ── v2.153.0（RX5/RX6）：剧情深度与分支树段（与性能与水位段共用输出区）──
    const pgOut = function (text) { setOut('#wa-pg-out', text); };
    on('#wa-pg-read', () => {
      if (!WA.plotGauge || !WA.plotGauge.tension) return pgOut('未记录：module-missing');
      // 面板读数**也走 push:false**：打开面板不该改变走向（「看一次」与「推一次」是两件事）。
      const r = WA.plotGauge.tension({ push: false });
      if (!r.ok) return pgOut('不足：' + r.reason
        + (r.reason === 'no-signal' ? '（三源都不在场 —— 该补数据源，不是「张力 0」）'
          : (r.reason === 'no-reading' ? '（三源在场但一条在途线都没有 —— 空世界是合法状态，不是故障）'
            : (r.reason === 'disabled' ? '（总开关关着）' : ''))));
      pgOut('张力 ' + r.score + '（' + r.band + '）· 在场权重 ' + r.activeWeight
        + '｜' + r.components.map(function (c) {
          return c.label + (c.present ? '=' + c.value + '(权重' + c.weight + ')' : '=缺席(权重' + c.weight + '已剔除)');
        }).join('；'));
    });
    on('#wa-pg-trend', () => {
      if (!WA.plotGauge || !WA.plotGauge.trend) return pgOut('未记录：module-missing');
      const t = WA.plotGauge.trend();
      if (!t.ok) return pgOut('不足：' + t.reason + (t.need ? '（样本 ' + t.samples + '/' + t.need + ' —— 两个点连不成趋势）' : ''));
      pgOut('走向 ' + t.direction + '｜' + t.from + ' → ' + t.to + '（Δ' + t.delta + '）· ' + t.samples + ' 点｜' + t.basis);
    });
    on('#wa-pg-advice', () => {
      if (!WA.plotGauge || !WA.plotGauge.advice) return pgOut('未记录：module-missing');
      const a = WA.plotGauge.advice();
      if (!a.ok) return pgOut('不足：' + a.reason);
      pgOut('张力 ' + a.score + '（' + a.band + '）｜' + a.rows.map(function (x) {
        return '【' + x.label + '】' + x.detail;
      }).join('／') + '｜' + a.basis);
    });
    on('#wa-pg-stat', () => {
      if (!WA.plotGauge || !WA.plotGauge.stat) return pgOut('未记录：module-missing');
      const s = WA.plotGauge.stat();
      pgOut('深度仪台账：' + (s.enabled ? '开' : '关') + '｜读数 ' + s.gauges + ' 次 · 拒收 ' + s.rejected
        + (s.lastReason ? '（最近：' + s.lastReason + '）' : '') + '｜趋势环 ' + s.samples + '/' + s.caps.maxPulses
        + '（进程态内存环，不落盘）' + (Object.keys(s.faults).length ? '｜分桶 ' + JSON.stringify(s.faults) : ''));
    });
    { const el = $('#wa-pg-enabled');
      if (el) el.onchange = function () {
        if (!WA.plotGauge || !WA.plotGauge.setSettings) return pgOut('未记录：module-missing');
        WA.plotGauge.setSettings({ enabled: !!el.checked });
        pgOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（趋势环清空，已读过的数不再留）'));
      };
    }
    const btVal = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const btErr = function (r) {
      return '未记录：' + ((r && r.reason) || '未知原因')
        + ((r && r.field) ? '（' + r.field + '）' : '')
        + ((r && r.allowed) ? '（可选走法：' + r.allowed.join('/') + '）' : '')
        + ((r && r.have !== undefined) ? '（给了 ' + r.have + ' 条，至少需 ' + r.need + ' 条）' : '');
    };
    on('#wa-bt-fork', () => {
      if (!WA.branchTree || !WA.branchTree.fork) return pgOut('未记录：module-missing');
      // 走法用逗号分隔——至少两条（一条走法的「选择」是流水账，不是分叉）。
      const opts = btVal('#wa-bt-opts').split(/[,，]/).map(function (x) { return x.trim(); }).filter(function (x) { return !!x; });
      const r = WA.branchTree.fork({ round: Number(btVal('#wa-bt-round')), prompt: btVal('#wa-bt-prompt'), options: opts });
      if (!r.ok) return pgOut(btErr(r));
      pgOut('已登记 ' + r.id + '（第' + r.round + '轮 · ' + r.options + ' 走法）'
        + (r.preview && r.preview.ok ? '·预览 ' + r.preview.id : '·无预览（未给 steps ⇒ 不跑 rehearsal）'));
    });
    on('#wa-bt-choose', () => {
      if (!WA.branchTree || !WA.branchTree.choose) return pgOut('未记录：module-missing');
      const r = WA.branchTree.choose(btVal('#wa-bt-id'), btVal('#wa-bt-choice'));
      if (!r.ok) return pgOut(btErr(r));
      pgOut('已记录 ' + r.id + ' ⇒ 选了「' + r.choice + '」');
    });
    on('#wa-bt-replay', () => {
      if (!WA.branchTree || !WA.branchTree.replay) return pgOut('未记录：module-missing');
      const r = WA.branchTree.replay(btVal('#wa-bt-id'));
      // not-comparable 必须照实说：那是「这份预演钉的世界已经变了」，不是「回放成功」。
      if (!r.ok) return pgOut(btErr(r) + (r.why ? '（' + r.why + '）' : '')
        + (r.reason === 'not-comparable' ? '（世界已变或从未预演 —— 不拿一个旧结论冒充可以回放）' : ''));
      pgOut('可回放 ' + r.id + '：预览 ' + r.previewId + (r.choice ? ' ⇒ 选了「' + r.choice + '」' : '（尚未记录实际选择）'));
    });
    on('#wa-bt-tree', () => {
      if (!WA.branchTree || !WA.branchTree.tree) return pgOut('未记录：module-missing');
      const t = WA.branchTree.tree();
      if (!t.ok) return pgOut('不足：' + t.reason);
      if (!t.nodes.length) return pgOut('还没有分叉点（本模块零自动登记 —— 谁在哪个点分叉由调用方决定）');
      pgOut('分支树 ' + t.nodes.length + ' 点 · ' + t.edges.length + ' 边 · ' + t.roots + ' 根 · 悬空边 ' + t.dangling
        + '（恒应为 0，报出来才是可核的）｜' + t.nodes.slice(0, 8).map(function (n) {
          return '第' + n.round + '轮「' + n.label + '」' + n.options + '走法' + (n.choice ? '→选了' + n.choice : '（未选）') + (n.preview ? '·有预览' : '');
        }).join('；'));
    });
    on('#wa-bt-nodes', () => {
      if (!WA.branchTree || !WA.branchTree.stat) return pgOut('未记录：module-missing');
      const s = WA.branchTree.stat();
      pgOut('分支台账：' + (s.enabled ? '开' : '关') + '｜节点 ' + s.nodes + '/' + s.caps.maxNodes + '（根 ' + s.roots
        + '）· 已选 ' + s.withChoice + ' · 有预览 ' + s.withPreview + '｜登记 ' + s.forks + ' 次 · 拒收 ' + s.refused
        + (s.lastReason ? '（最近：' + s.lastReason + '）' : ''));
    });
    on('#wa-bt-compare', () => {
      if (!WA.branchTree || !WA.branchTree.compare) return pgOut('未记录：module-missing');
      const ea = $('#wa-bt-a'), eb = $('#wa-bt-b');
      const r = WA.branchTree.compare((ea && ea.value) || '', (eb && eb.value) || '');
      if (!r.ok) return pgOut('不足：' + r.reason + (r.missing ? '（缺：' + r.missing + '）' : '')
        + (r.reason === 'not-comparable' ? '（两侧都没有可比指纹 —— 没得比不是「一模一样」）' : ''));
      pgOut('比对 ' + r.a + ' ↔ ' + r.b + '：差异 ' + r.differing + ' 项 · 未知 ' + r.unknown + ' 项｜'
        + r.rows.map(function (x) { return x.key + '=' + x.state; }).join('；'));
    });
    { const el = $('#wa-bt-enabled');
      if (el) el.onchange = function () {
        if (!WA.branchTree || !WA.branchTree.setSettings) return pgOut('未记录：module-missing');
        WA.branchTree.setSettings({ enabled: !!el.checked });
        pgOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（账本不动，只是不再登记新点）'));
      };
    }
    // ── v2.154.0（RX4 世界联网面）：九枚控件 + 一个输出区（渲染在联网页）。
    //   三件齐做（渲染 + 绑定 + UI_BINDINGS 守卫登记）—— 理由与 v2.151.0/v2.153.0 各批一致：
    //   渲染了不登记，「渲染了但绑定的 id 写错」在这批控件上永不可见。
    //   输出区分两栏：联网面（wa-nb-out）与自洽审计（wa-ec-out）不共用 —— 两者的读数口径不同
    //   （一个是「传了什么」，一个是「世界哪里不自洽」），合成一栏就是把两件事说成一件事。
    const nbOut = function (text, keep) {
      if (keep) panelEl.dataset.nbOut = text;
      setOut('#wa-nb-out', text);
    };
    if (panelEl.dataset.nbOut) setOut('#wa-nb-out', panelEl.dataset.nbOut);
    // 拒收原因一律照实转述引擎原话 —— 面板**不替引擎解释**（解释一处走偏，四处读数全部失真）。
    const nbErr = function (r) {
      return '未记录：' + ((r && r.reason) || '未知原因')
        + ((r && r.field) ? '（' + r.field + '）' : '')
        + ((r && r.malformed) ? '（剔除了 ' + r.malformed + ' 条格式不对的）' : '');
    };
    { const el = $('#wa-nb-enabled');
      if (el) el.onchange = function () {
        if (!WA.worldBridge || !WA.worldBridge.setSettings) return nbOut('未记录：module-missing', true);
        WA.worldBridge.setSettings({ enabled: !!el.checked });
        // 「不再联网」与「传过来的传说被删了」是两件事：关掉后既有传说仍在存档里。
        nbOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（既有传说与导入签名保留在存档里，只是不再导出／导入／转投）'), true);
      };
    }
    on('#wa-nb-ident', () => {
      if (!WA.worldBridge || !WA.worldBridge.setSettings) return nbOut('未记录：module-missing', true);
      const t = $('#wa-nb-title'), p = $('#wa-nb-player');
      WA.worldBridge.setSettings({ worldTitle: (t && t.value ? t.value.trim() : ''), playerName: (p && p.value ? p.value.trim() : '') });
      const k = WA.worldBridge.worldKey();
      nbOut('已记录身份：' + k.label + '｜签名 ' + (k.sig || '(不成签名：' + (k.complete ? '?' : '缺 ' + (!k.title ? 'worldTitle' : 'playerName')) + ')'), true);
    });
    on('#wa-nb-key', () => {
      if (!WA.worldBridge || !WA.worldBridge.worldKey) return nbOut('未记录：module-missing', true);
      const k = WA.worldBridge.worldKey();
      nbOut('世界签名：' + (k.sig || '(不成签名)')
        + '｜titleId ' + (k.titleId || '-') + ' · playerId ' + (k.playerId || '-')
        + '｜' + k.label + '（两段派生值缺任一段就整份不成签名 —— '
        + '拿半份身份去判「是不是同一个世界」是假判据）', true);
    });
    on('#wa-nb-seed', () => {
      if (!WA.worldBridge || !WA.worldBridge.seed) return nbOut('未记录：module-missing', true);
      if (!WA.store || !WA.store.transact) return nbOut('未记录：store-unavailable', true);
      let r = null;
      // **必须在事务里调用**（seed 改的是 draft.worldBridge，自己不开事务 —— 与本仓边界一致）。
      WA.store.transact(function (d) { r = WA.worldBridge.seed(d); }, 'ui:worldBridge');
      if (!r || !r.ok) return nbOut(nbErr(r || { reason: 'store-unavailable' }), true);
      nbOut('已落种子 ' + r.sig + '（第 ' + r.seeds + ' 次）· ' + r.label, true);
    });
    on('#wa-nb-export', () => {
      if (!WA.worldBridge || !WA.worldBridge.exportLegends) return nbOut('未记录：module-missing', true);
      const r = WA.worldBridge.exportLegends();
      if (!r.ok) return nbOut(nbErr(r) + (r.reason === 'no-chronicle' ? '（编年史还是空的 —— 推演几轮后才有大事可传）' : ''), true);
      __nbPack = r.pack;
      nbOut('已导出 ' + r.exported + '/' + r.total + ' 条（三类：大战／大案／大人物崛起）· 脱敏剔除 ' + r.redacted + ' 句'
        + '（口径：' + (r.privateWords || []).join('、') + '）· 整条剔除 ' + r.dropped + ' 条'
        + '｜包已暂存本页，导入时留空即用它', true);
    });
    on('#wa-nb-import', () => {
      if (!WA.worldBridge || !WA.worldBridge.importLegends) return nbOut('未记录：module-missing', true);
      const box = $('#wa-nb-pack');
      const raw = box && box.value ? box.value.trim() : '';
      let pack = __nbPack;
      if (raw) {
        try { pack = JSON.parse(raw); } catch (e) { return nbOut('未记录：bad-payload（粘贴的不是合法 JSON）', true); }
      }
      if (!pack) return nbOut('未记录：missing-fields（pack）—— 先导出一次，或把传说包 JSON 粘进输入框', true);
      const r = WA.worldBridge.importLegends(pack, { remember: true });
      if (!r.ok) return nbOut(nbErr(r), true);
      if (!r.added) return nbOut('已记录 0 条：' + r.reason + '（' + r.dup + ' 条都收过 —— 「都收过」不是「别处什么都没传」）', true);
      nbOut('已收下 ' + r.added + ' 条（重复 ' + r.dup + ' · 格式剔除 ' + r.malformed + '）· 传说链共 ' + r.total + ' 条｜来自 ' + r.source
        + '（存的是「听说的」，不是本世界的事实）', true);
    });
    on('#wa-nb-legends', () => {
      if (!WA.worldBridge || !WA.worldBridge.view) return nbOut('未记录：module-missing', true);
      const v = WA.worldBridge.view();
      nbOut(v.count ? '传说 ' + v.count + ' 条：' + v.rows.slice(0, 8).map(function (x) {
        return x.id + '「' + x.title + '」(' + x.label + '·来自 ' + (x.fromTitle || x.from) + (x.heard ? '·已传开 ' + x.heard + ' 次' : '') + ')';
      }).join('；') : '还没有收下任何传说（联网面关着也会是空的 —— 两种局面在「台账」里可分辨）', true);
    });
    on('#wa-nb-relay', () => {
      if (!WA.worldBridge || !WA.worldBridge.toRumor) return nbOut('未记录：module-missing', true);
      const box = $('#wa-nb-lg');
      const r = WA.worldBridge.toRumor(box && box.value ? box.value.trim() : '');
      if (!r.ok) {
        return nbOut(nbErr(r) + (r.factAdded ? '｜但事实 ' + r.factKey + ' 已落下（不回滚：它确实被记下了，删掉就是篡改）' : ''), true);
      }
      nbOut('已转投 ' + r.id + '：事实 ' + r.factKey + (r.factAdded ? '（新落）' : '（已存在，复用）')
        + ' · rumor 链 ' + r.chain + ' · 已传开 ' + r.heard + ' 次', true);
    });
    on('#wa-nb-block', () => {
      if (!WA.worldBridge || !WA.worldBridge.buildBlock) return nbOut('未记录：module-missing', true);
      const t = WA.worldBridge.buildBlock();
      nbOut(t ? t : '本轮不进正文（关闭 / 无传说 —— 两种局面都可能是空块，台账可分辨）', true);
    });
    on('#wa-nb-stat', () => {
      if (!WA.worldBridge || !WA.worldBridge.stat) return nbOut('未记录：module-missing', true);
      const s = WA.worldBridge.stat();
      const c = s.caps || {};
      const f = s.faults || {};
      const fk = Object.keys(f).map(function (k) { return k + '×' + f[k]; }).join('、');
      nbOut('联网台账：' + (s.enabled ? '开' : '关') + '｜签名 ' + (s.sig || '(不成签名)')
        + ' · 身份' + (s.identityComplete ? '齐' : '不全') + ' · 落种子 ' + s.seeds + ' 次'
        + '｜传说 ' + s.legends + '/' + c.legends + ' · 已导入签名 ' + s.exportedSigs + '/' + c.exported
        + '｜导出 ' + s.exported + ' 次（剔句 ' + s.redacted + '·空条 ' + s.dropped + '）· 导入 ' + s.imported
        + ' 条 · 转投 ' + s.relays + ' 次 · 读 ' + s.reads + ' 次 · 拒收 ' + s.refusals
        + (s.lastReason ? '（最近：' + s.lastReason + '）' : '')
        + (fk ? '｜归因：' + fk : ''), true);
    });
    // ── v2.154.0（RX7 生态自洽审计）：四枚只读出口 + 一枚扫描 + 四类开关 ──
    const ecOut = function (text, keep) {
      if (keep) panelEl.dataset.ecOut = text;
      setOut('#wa-ec-out', text);
    };
    if (panelEl.dataset.ecOut) setOut('#wa-ec-out', panelEl.dataset.ecOut);
    { const el = $('#wa-ec-enabled');
      if (el) el.onchange = function () {
        if (!WA.ecoAudit || !WA.ecoAudit.setSettings) return ecOut('未记录：module-missing', true);
        WA.ecoAudit.setSettings({ enabled: !!el.checked });
        // 「不再扫」与「扫过是干净的」是两件事：关掉后上一次读数仍在，但已不是**当前**世界的读数。
        ecOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（上一次读数还在，但它已不是当前世界的读数了）'), true);
      };
    }
    on('#wa-ec-save', () => {
      if (!WA.ecoAudit || !WA.ecoAudit.setSettings) return ecOut('未记录：module-missing', true);
      const rd = function (id) { const e = $(id); return !!(e && e.checked); };
      WA.ecoAudit.setSettings({ timelineEnabled: rd('#wa-ec-tl'), spaceEnabled: rd('#wa-ec-sp'),
        cognitionEnabled: rd('#wa-ec-cog'), causalEnabled: rd('#wa-ec-cau') });
      const c = WA.ecoAudit.getSettings();
      ecOut('已记录类别：时间线 ' + (c.timelineEnabled ? '开' : '关') + ' · 空间 ' + (c.spaceEnabled ? '开' : '关')
        + ' · 认知 ' + (c.cognitionEnabled ? '开' : '关') + ' · 因果 ' + (c.causalEnabled ? '开' : '关')
        + '（关掉的那一类不进扫描，读数里如实标 off —— 不拿「没扫」冒充「没问题」）', true);
    });
    on('#wa-ec-sweep', () => {
      if (!WA.ecoAudit || !WA.ecoAudit.sweep) return ecOut('未记录：module-missing', true);
      const r = WA.ecoAudit.sweep();
      if (!r.ok) return ecOut('未记录：' + r.reason, true);
      ecOut('已扫：' + r.ms + 'ms · 问题 ' + r.total + '（error ' + r.errors + ' · warn ' + r.warns + '）'
        + (r.truncated ? '（已按上限截断，另有 ' + r.truncated + ' 条没列出来）' : '')
        + (r.failedSections ? ' · 没做成的小节 ' + r.failedSections + ' 个（本类读数不可信）' : '')
        + '｜判据来源：认知 ' + r.sources.cognition + ' · 因果 ' + r.sources.causal
        + '（只报不改 —— 自动改架空的正是「世界为什么自洽」本身）', true);
    });
    on('#wa-ec-issues', () => {
      if (!WA.ecoAudit || !WA.ecoAudit.lastSweep) return ecOut('未记录：module-missing', true);
      const r = WA.ecoAudit.lastSweep();
      if (r.reason === 'stale') return ecOut('上一份自洽读数已过期，需重新扫描。', true);
      if (!r.ok) return ecOut('还没有扫描读数（先按一次「扫描」）—— 「没扫过」不等于「扫过是干净的」', true);
      if (!r.total) return ecOut('上一次扫描：0 条问题（四类全扫过）· 用时 ' + r.ms + 'ms', true);
      ecOut('上一次扫描 ' + r.total + ' 条' + (r.truncated ? '（另截断 ' + r.truncated + ' 条）' : '') + '：'
        + r.issues.map(function (i) { return '[' + i.level + ']' + i.code + '「' + (i.detail || '') + '」'; }).join('；'), true);
    });
    on('#wa-ec-last', () => {
      if (!WA.ecoAudit || !WA.ecoAudit.lastSweep) return ecOut('未记录：module-missing', true);
      const r = WA.ecoAudit.lastSweep();
      if (r.reason === 'stale') return ecOut('上一份自洽读数已过期，需重新扫描。', true);
      if (!r.ok) return ecOut('never-swept：本会话还没扫过。审计读到的是**当前世界**的自洽性，'
        + '故不缓存上一次会话的结论 —— 空读数与「干净」必须分得开', true);
      ecOut('上次读数：' + r.total + ' 条（error ' + r.errors + ' · warn ' + r.warns + '）· ' + r.ms + 'ms'
        + '｜规则 时间线' + (r.rules.timeline ? '✓' : '✗') + ' 空间' + (r.rules.space ? '✓' : '✗')
        + ' 认知' + (r.rules.cognition ? '✓' : '✗') + ' 因果' + (r.rules.causal ? '✓' : '✗')
        + '｜判据 认知 ' + r.sources.cognition + ' · 因果 ' + r.sources.causal
        + (r.failedSections ? ' · 没做成 ' + r.failedSections + ' 个小节' : ''), true);
    });
    on('#wa-ec-stat', () => {
      if (!WA.ecoAudit || !WA.ecoAudit.stat) return ecOut('未记录：module-missing', true);
      const s = WA.ecoAudit.stat();
      const f = s.faults || {};
      const fk = Object.keys(f).map(function (k) { return k + '×' + f[k]; }).join('、');
      const dc = Object.keys(s.degraded || {}).map(function (k) { return k + '×' + s.degraded[k]; }).join('、');
      ecOut('审计台账：' + (s.enabled ? '开' : '关') + '｜扫描 ' + s.sweeps + ' 次 · 累计问题 ' + s.issues
        + '（截断 ' + s.truncated + '）· 上次 ' + s.lastIssues + ' 条'
        + '（' + s.lastScannedAt + '，用时 ' + s.lastMs + 'ms）'
        + '｜按码 ' + (Object.keys(s.byCode).map(function (k) { return k + '×' + s.byCode[k]; }).join('、') || '无')
        + '｜按类 ' + (Object.keys(s.byCat).map(function (k) { return k + '×' + s.byCat[k]; }).join('、') || '无')
        + '｜上限 问题 ' + s.caps.issues + ' · 人 ' + s.caps.people
        + (dc ? '｜降级小节 ' + dc : '')
        + (fk ? '｜归因：' + fk : ''), true);
    });

    // ── v2.155.0（RX8 世界种子库）：十三枚控件 + 一个输出区（渲染在「工具」页）。
    //   输出区独立于联网面（wa-nb-out）与自洽审计（wa-ec-out）：三者的读数口径不同
    //   （一个是「传了什么」、一个是「世界哪里不自洽」、一个是「这一局是什么格局」）。
    const wsOut = function (text, keep) {
      if (keep) panelEl.dataset.wsOut = text;
      setOut('#wa-ws-out', text);
    };
    if (panelEl.dataset.wsOut) setOut('#wa-ws-out', panelEl.dataset.wsOut);
    // 拒收原因一律照实转述引擎原话（含 existing / allowed / hint 三个诊断字段）——
    //   面板不替引擎解释：解释一处走偏，四处读数全部失真。
    const wsErr = function (r) {
      return '未记录：' + ((r && r.reason) || '未知原因')
        + ((r && r.field) ? '（' + r.field + '）' : '')
        + ((r && r.existing) ? '（已有同结构种子 ' + r.existing + '）' : '')
        + ((r && r.allowed) ? '（允许 ' + r.allowed[0] + '–' + r.allowed[1] + '）' : '')
        + ((r && r.hint) ? '（' + r.hint + '）' : '');
    };
    const wsVal = function (sel) { const el = $(sel); return (el && el.value) ? String(el.value).trim() : ''; };
    { const el = $('#wa-ws-enabled');
      if (el) el.onchange = function () {
        if (!WA.worldSeed || !WA.worldSeed.setSettings) return wsOut('未记录：module-missing', true);
        WA.worldSeed.setSettings({ enabled: !!el.checked });
        wsOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（库内种子仍留在存档里，只是不再提取／保存／播种）'), true);
      };
    }
    on('#wa-ws-extract', () => {
      if (!WA.worldSeed || !WA.worldSeed.extract) return wsOut('未记录：module-missing', true);
      const r = WA.worldSeed.extract();
      if (!r.ok) return wsOut(wsErr(r) + (r.reason === 'nothing-to-extract' ? '（四张结构表全空 —— 不产空种子）' : ''), true);
      wsOut('已提取 签名 ' + r.sig + '｜势力 ' + r.counts.powers + ' · 关系节点 ' + r.counts.nodes
        + ' · 关系边 ' + r.counts.edges + ' · 地名 ' + r.counts.places
        + '｜本种子不含：' + r.excluded.join('/') + '（存的是格局，不是进度 —— 有进度的种子播出来是续集）', true);
    });
    on('#wa-ws-save', () => {
      if (!WA.worldSeed || !WA.worldSeed.save) return wsOut('未记录：module-missing', true);
      const t = wsVal('#wa-ws-tags');
      const r = WA.worldSeed.save(wsVal('#wa-ws-name'), t);
      if (!r.ok) return wsOut(wsErr(r), true);
      wsOut('已保存 ' + r.id + '「' + r.name + '」标签 ' + (r.tags.join('/') || '无') + '｜库内 ' + r.total + ' 个'
        + ((t && !r.tags.length) ? '（标签不在闭集内，未记入 —— 不猜你要的是哪一个）' : ''), true);
      renderBody();
    });
    on('#wa-ws-list', () => {
      if (!WA.worldSeed || !WA.worldSeed.list) return wsOut('未记录：module-missing', true);
      const r = WA.worldSeed.list();
      if (!r.rows.length) return wsOut('库是空的（还没保存过种子）—— 这不是「没有可存的格局」', true);
      wsOut(r.rows.map(function (x) {
        return x.id + '「' + x.name + '」[' + (x.tags.join('/') || '无标签') + '] ∈ ' + x.sig
          + '（势力 ' + x.counts.powers + '／节点 ' + x.counts.nodes + '／地名 ' + x.counts.places + '）';
      }).join('；'), true);
    });
    on('#wa-ws-get', () => {
      if (!WA.worldSeed || !WA.worldSeed.get) return wsOut('未记录：module-missing', true);
      const r = WA.worldSeed.get(wsVal('#wa-ws-id'));
      if (!r.ok) return wsOut(wsErr(r), true);
      const sd = r.row.seed || {};
      wsOut('取到 ' + r.row.id + '「' + r.row.name + '」签名 ' + sd.sig
        + '｜势力 ' + ((sd.powers || []).map(function (p) { return p.name + '(' + p.weight + ')'; }).join('、') || '无')
        + '｜地名 ' + ((sd.geo && sd.geo.places || []).join('、') || '无')
        + '｜时代 ' + ((sd.era && (sd.era.label || sd.era.title)) || '无'), true);
    });
    on('#wa-ws-sow', () => {
      if (!WA.worldSeed || !WA.worldSeed.sow) return wsOut('未记录：module-missing', true);
      const v = wsVal('#wa-ws-variance');
      const r = WA.worldSeed.sow(wsVal('#wa-ws-id'), v === '' ? undefined : v);
      if (!r.ok) return wsOut(wsErr(r), true);
      const p = r.plan;
      wsOut('播种计划（**只是计划，世界一个字没动**）：自「' + p.name + '」· 签名 ' + p.sig
        + ' · 变异度 ' + p.variance
        + '｜势力 ' + (p.powers.map(function (x) { return x.name + '(' + x.weight + ')'; }).join('、') || '无')
        + '｜地名 ' + (p.geo.places.join('、') || '无')
        + '｜进度归零 ' + (p.zeroProgress ? '是' : '否')
        + '（轮 ' + p.progress.round + '／编年史 ' + p.progress.chronicle + '／暗流 ' + p.progress.currents
        + '／回声 ' + p.progress.echoes + '）—— 重开一局这个动作属于宿主，不属于本引擎', true);
    });
    on('#wa-ws-drop', () => {
      if (!WA.worldSeed || !WA.worldSeed.drop) return wsOut('未记录：module-missing', true);
      const r = WA.worldSeed.drop(wsVal('#wa-ws-id'));
      if (!r.ok) return wsOut(wsErr(r), true);
      wsOut('已删除 ' + r.id + '｜库内剩 ' + r.total + ' 个', true);
      renderBody();
    });
    // v2.158.0（S3 + SP6）：转移包 / 导入包 / 初始化预览 / 初始化确认 四处理器。
    on('#wa-ws-pack', () => {
      if (!WA.worldSeed || !WA.worldSeed.transferPack) return wsOut('未记录：module-missing', true);
      const r = WA.worldSeed.transferPack(wsVal('#wa-ws-id'));
      if (!r.ok) return wsOut(wsErr(r), true);
      const pk = r.pack;
      wsOut('转移包（复制以下 JSON 到目标聊天）：包版本 v' + pk.packVer + '｜来源 ' + pk.chatId
        + '｜种子「' + pk.name + '」· 签名 ' + pk.seed.sig
        + '｜势力 ' + pk.counts.powers + ' · 节点 ' + pk.counts.nodes + ' · 边 ' + pk.counts.edges
        + ' · 地名 ' + pk.counts.places + '\n' + JSON.stringify(pk), true);
    });
    on('#wa-ws-import', () => {
      if (!WA.worldSeed || !WA.worldSeed.importPack) return wsOut('未记录：module-missing', true);
      const raw = wsVal('#wa-ws-packin');
      if (!raw) return wsOut('未记录：请先粘贴转移包 JSON', true);
      let pk;
      try { pk = JSON.parse(raw); } catch (e) { return wsOut('未记录：包 JSON 解析失败（' + (e && e.message) + '）', true); }
      const r = WA.worldSeed.importPack(pk);
      if (!r.ok) return wsOut(wsErr(r), true);
      wsOut('已导入转移包：新种子 ' + r.id + '（' + r.name + '）｜来自 ' + r.fromChat
        + '｜库内 ' + r.total + ' 个 —— 下一步「初始化预览」', true);
    });
    on('#wa-ws-init', () => {
      if (!WA.worldSeed || !WA.worldSeed.initPreview) return wsOut('未记录：module-missing', true);
      const v = wsVal('#wa-ws-variance');
      const r = WA.worldSeed.initPreview(wsVal('#wa-ws-id'), v === '' ? undefined : v);
      if (!r.ok) return wsOut(wsErr(r), true);
      const p = r.plan;
      wsOut('初始化预览（**世界一个字没动**，确认才落笔）：自「' + p.name + '」· 签名 ' + p.sig
        + ' · 变异度 ' + p.variance + (p._fixed ? '（已定格，确认不重抽）' : '')
        + '｜拟装：势力 ' + p.powers.length + '（' + p.powers.map(function (x) { return x.name + '(' + x.weight + ')'; }).join('、') + '）'
        + ' · 人物 ' + p.network.nodes.length + ' · 关系边 ' + p.network.edges.length
        + ' · 地名 ' + p.geo.places.length + (p.geo.roads ? '（另记道路数 ' + p.geo.roads + '，不还原端点）' : '')
        + ' · 时代「' + (p.era.label || p.era.title || '无') + '」'
        + '｜进度归零（轮 0 / 编年史 0 / 暗流 0 / 回声 0）'
        + (r.retainNote ? '\n' + r.retainNote : ''), true);
    });
    on('#wa-ws-confirm', () => {
      if (!WA.worldSeed || !WA.worldSeed.initConfirm) return wsOut('未记录：module-missing', true);
      const r = WA.worldSeed.initConfirm();
      if (!r.ok) return wsOut(wsErr(r), true);
      if (r.reason === 'already') {
        wsOut('这个世界已从种子「' + r.name + '」（签名 ' + r.sig + '）初始化过 —— 本次不重装（安装于 ' + r.installedAt + '）', true);
        return;
      }
      const i = r.installed;
      wsOut('已初始化新局：势力 ' + i.factions + ' · 人物 ' + i.nodes + ' · 关系边 ' + i.edges
        + ' · 地名 ' + i.places + '（道路如实 0 条：种子只记数量不记端点）'
        + '｜进度归零，来源已记入 meta.initFrom（签名 ' + r.sig + ' · 变异度 ' + r.variance + '）—— 可以继续游玩了', true);
      renderBody();
    });
    on('#wa-ws-stat', () => {
      if (!WA.worldSeed || !WA.worldSeed.stat) return wsOut('未记录：module-missing', true);
      const s = WA.worldSeed.stat();
      const f = s.faults || {};
      const fk = Object.keys(f).map(function (k) { return k + '×' + f[k]; }).join('、');
      wsOut('种子库台账：' + (s.enabled ? '开' : '关') + '｜提取 ' + s.extracts + ' 次 · 保存 ' + s.saves
        + ' 次 · 播种 ' + s.sows + ' 次｜库内 ' + s.total + '／上限 ' + s.libCap
        + '｜种子版本 v' + s.seedVer + ' · 变异度 ' + s.variance.min + '–' + s.variance.max
        + '｜标签闭集 ' + s.tags.join('/')
        + '｜上次 ' + (s.lastReason || '无')
        + (s.hasLast ? '（身上有未保存的提取：' + s.lastSig + '）' : '（尚未提取过 —— 「没提取过」不等于「这个格局不值得存」）')
        + (fk ? '｜拒收归因 ' + fk : ''), true);
    });
    // ── v2.164.0（TX5 世界蓝图）：九枚控件 + 一个输出区（渲染在「工具」页）。
    //   三件齐做（渲染 + 绑定 + UI_BINDINGS 守卫登记）—— 理由与 v2.155.0 种子库同批一致。
    //   与种子库共用 wsErr 的形状，但**不共用输出区**：种子库那栏答的是「格局存了没」，
    //   这一栏答的是「这个世界能不能原样搬走」——合成一栏就是把两件事说成一件事。
    const bpOut = function (text, keep) {
      if (keep) panelEl.dataset.bpOut = text;
      setOut('#wa-bp-out', text);
    };
    if (panelEl.dataset.bpOut) setOut('#wa-bp-out', panelEl.dataset.bpOut);
    { const el = $('#wa-bp-enabled');
      if (el) el.onchange = function () {
        if (!WA.worldBlueprint || !WA.worldBlueprint.setSettings) return bpOut('未记录：module-missing', true);
        WA.worldBlueprint.setSettings({ enabled: !!el.checked });
        bpOut('已记录 ' + (el.checked ? 'enabled' : 'disabled（库内蓝图仍留在存档里，只是不再导出／保存／安装）'), true);
      };
    }
    on('#wa-bp-export', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.exportBlueprint) return bpOut('未记录：module-missing', true);
      const r = WA.worldBlueprint.exportBlueprint({ keep: wsVal('#wa-bp-keep') || undefined });
      if (!r.ok) return bpOut(wsErr(r) + (r.reason === 'empty-blueprint' ? '（四张结构表全空 —— 不产空蓝图）' : ''), true);
      bpOut('已导出 签名 ' + r.bpSig + '｜保留层级 ' + r.blueprint.keep + '｜人物 ' + r.counts.people
        + ' · 势力 ' + r.counts.powers + ' · 地点 ' + r.counts.places + ' · 关系 ' + r.counts.relations
        + ' · 道路 ' + r.counts.roads
        + '｜本蓝图不含：' + r.excluded.join('/') + '（搬的是结构，不是这一局发生过什么）', true);
    });
    on('#wa-bp-save', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.save) return bpOut('未记录：module-missing', true);
      const r = WA.worldBlueprint.save(wsVal('#wa-bp-name'), wsVal('#wa-bp-tags'));
      if (!r.ok) return bpOut(wsErr(r), true);
      bpOut('已保存 ' + r.id + '「' + r.name + '」｜库内 ' + r.total + ' 张'
        + '（人物 ' + r.counts.people + ' · 势力 ' + r.counts.powers + ' · 地点 ' + r.counts.places
        + ' · 道路 ' + r.counts.roads + '）', true);
      renderBody();
    });
    on('#wa-bp-list', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.list) return bpOut('未记录：module-missing', true);
      const r = WA.worldBlueprint.list();
      if (!r.rows.length) return bpOut('库是空的（还没保存过蓝图）—— 这不是「没有可搬的世界」', true);
      bpOut(r.rows.map(function (x) {
        return x.id + '「' + x.name + '」[' + (x.tags.join('/') || '无标签') + '] v' + x.bpVer + ' ∈ ' + x.bpSig
          + '（人物 ' + x.counts.people + '／势力 ' + x.counts.powers + '／地点 ' + x.counts.places + '／道路 ' + x.counts.roads + '）';
      }).join('；'), true);
    });
    on('#wa-bp-get', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.get) return bpOut('未记录：module-missing', true);
      const r = WA.worldBlueprint.get(wsVal('#wa-bp-id'));
      if (!r.ok) return bpOut(wsErr(r), true);
      const bp = r.row.bp || {};
      bpOut('取到 ' + r.row.id + '「' + r.row.name + '」v' + bp.bpVer + ' 签名 ' + bp.bpSig
        + '｜势力 ' + ((bp.ids && bp.ids.powers || []).map(function (p) { return p.name + '(' + p.weight + ')'; }).join('、') || '无')
        + '｜地点 ' + ((bp.ids && bp.ids.places || []).map(function (p) { return p.name; }).join('、') || '无')
        + '｜道路 ' + ((bp.roads || []).length) + ' 条'
        + '｜时代 ' + ((bp.era && (bp.era.label || bp.era.title)) || '无'), true);
    });
    on('#wa-bp-drop', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.drop) return bpOut('未记录：module-missing', true);
      const r = WA.worldBlueprint.drop(wsVal('#wa-bp-id'));
      if (!r.ok) return bpOut(wsErr(r), true);
      bpOut('已删除 ' + r.id + '｜库内剩 ' + r.total + ' 张', true);
      renderBody();
    });
    on('#wa-bp-check', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.checkIntegrity) return bpOut('未记录：module-missing', true);
      const g = WA.worldBlueprint.get(wsVal('#wa-bp-id'));
      if (!g.ok) return bpOut(wsErr(g), true);
      const ic = WA.worldBlueprint.checkIntegrity(g.row.bp);
      if (ic.ok) return bpOut('引用完整性通过：无重复 ID · 无悬空引用 · 无未知顶层键（三判据与安装侧同源，不是另写一套）', true);
      bpOut('引用完整性不通过：'
        + (ic.dupIds.length ? '重复 ID ' + ic.dupIds.slice(0, 8).join('、') + '｜' : '')
        + (ic.dangling.length ? '悬空引用 ' + ic.dangling.slice(0, 8).join('、') + '｜' : '')
        + (ic.unknownKeys.length ? '未知顶层键 ' + ic.unknownKeys.slice(0, 8).join('、') : ''), true);
    });
    on('#wa-bp-empty', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.targetEmpty) return bpOut('未记录：module-missing', true);
      const ec = WA.worldBlueprint.targetEmpty();
      bpOut(ec.empty
        ? '当前是空新局（12 项逐格清点全空）—— 可以安装蓝图'
        : '当前**不是**空新局：' + ec.what.join('、')
          + '（蓝图安装只作用于空新局 —— 不覆盖既有存档；要装请先开新局）', true);
    });
    on('#wa-bp-preview', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.previewImport) return bpOut('未记录：module-missing', true);
      const g = WA.worldBlueprint.get(wsVal('#wa-bp-id'));
      if (!g.ok) return bpOut(wsErr(g), true);
      const r = WA.worldBlueprint.previewImport(g.row.bp);
      if (!r.ok) return bpOut(wsErr(r), true);
      const p = r.plan;
      bpOut('导入预览（**世界一个字没动**，安装才落笔）：v' + p.bpVer + ' · 签名 ' + p.bpSig + ' · 保留层级 ' + p.keep
        + '｜拟装：人物 ' + p.ids.people.length + ' · 势力 ' + p.ids.powers.length
        + ' · 地点 ' + p.ids.places.length + ' · 关系 ' + p.relations.length + ' · 道路 ' + p.roads.length
        + ' · 时代「' + (p.era.label || p.era.title || '无') + '」'
        + '｜场景起点 ' + p.scene.id + (p.scene.enabled ? '（启用）' : '（未启用）') + ' · 进度归零 ' + (p.scene.zeroed ? '是' : '否')
        + (r.ambiguousNames && r.ambiguousNames.length ? '｜同名多 key（按 key 引用，不静默挑一个）：' + r.ambiguousNames.join('/') : '')
        + (r.retainNote ? '\n' + r.retainNote : ''), true);
    });
    on('#wa-bp-import', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.importBlueprint) return bpOut('未记录：module-missing', true);
      const r = WA.worldBlueprint.importBlueprint();
      if (r.ok && r.reason === 'already') {
        bpOut('这个世界已从蓝图（签名 ' + r.bpSig + '）安装过 —— 本次不重装（安装于 ' + r.installedAt + '）', true);
        return;
      }
      if (!r.ok) return bpOut(wsErr(r)
        + (r.reason === 'not-empty' && r.what ? '（非空：' + r.what.join('、') + '）' : ''), true);
      const i = r.installed;
      bpOut('已安装蓝图：人物 ' + i.people + ' · 势力 ' + i.powers + ' · 地点 ' + i.places
        + ' · 关系 ' + i.relations + ' · 道路 ' + i.roads + '（**端点如实复原** —— 这是蓝图对种子的净增量）'
        + '｜进度归零，安装留痕已写入 blueprint.installed（签名 ' + r.bpSig + '）—— 可以继续游玩了', true);
      renderBody();
    });
    on('#wa-bp-stat', () => {
      if (!WA.worldBlueprint || !WA.worldBlueprint.stat) return bpOut('未记录：module-missing', true);
      const s = WA.worldBlueprint.stat();
      const f = s.faults || {};
      const fk = Object.keys(f).map(function (k) { return k + '×' + f[k]; }).join('、');
      bpOut('蓝图台账：' + (s.enabled ? '开' : '关') + '｜导出 ' + s.exports + ' 次 · 保存 ' + s.saves
        + ' 次 · 预览 ' + s.previews + ' 次 · 安装 ' + s.imports + ' 次｜库内 ' + s.total + '／上限 ' + s.libCap
        + '｜蓝图版本 v' + s.bpVer + ' · 保留层级 ' + s.keepLevels.join('/') + ' · 场景 ' + s.scenes.join('/')
        + '｜上次 ' + (s.lastReason || '无')
        + (s.hasPending ? '（有未确认的导入票据 —— 未确认不落盘）' : '')
        + (s.hasInstalled ? '（已安装留痕：v' + s.installedBpVer + ' · ' + s.installedSig + '）' : '')
        + (fk ? '｜拒收归因 ' + fk : ''), true);
    });
    on('#wa-life-goal', () => { if (!WA.life) return lifeOut({ ok: false, reason: 'module-missing' }, true); const x = lifeText(); lifeOut(WA.life.addGoal(x.person, { text: x.text }), true); renderBody(); });
    on('#wa-life-promise', () => { if (!WA.life) return lifeOut({ ok: false, reason: 'module-missing' }, true); const x = lifeText(); lifeOut(WA.life.addCommitment(x.person, { kind: 'promise', target: '玩家', text: x.text }), true); renderBody(); });
    on('#wa-life-schedule', () => { if (!WA.life) return lifeOut({ ok: false, reason: 'module-missing' }, true); const x = lifeText(); const now = clockNow('ui.life'); lifeOut(WA.life.addSchedule(x.person, { activity: x.text, start: now, end: now + 3600000 }), true); renderBody(); });
    // v2.132.0（O19）：结算输出补游标读数 —— 玩家此前看不到「这一轮从谁开始」，
    //   于是「跨会话延续」与「每次都从 0 开始」在面板上不可分辨。`(续)` 标的是**本会话开局**
    //   是否从盘上恢复过（与 tick 次数无关，故只在恢复过时出现）。
    on('#wa-life-tick', () => { if (!WA.life) return lifeOut({ ok: false, reason: 'module-missing' }, true); const x = lifeText(); const now = clockNow('ui.life'); const person = WA.store && x.person ? ((WA.store.get()||{}).people||{})['p_'+x.person] : null; const goal = person && person.life && (person.life.goals||[]).filter(g=>g.status==='active')[0]; const decision = person && goal && WA.life.decide ? WA.life.decide(goal, person, { now: now, with: '玩家' }) : null; const r = WA.life.tick({ now: now, with: '玩家', decision: decision }); const why = decision ? (decision.action + '/' + decision.reason) : (r.reason || ''); const st = WA.life.stat ? WA.life.stat() : {}; lifeOut({ ok: !!r.ok, id: (r.changed || 0) + ':' + why + '·轮转起点' + (st.lastTurn || 0) + (st.turnRestored ? '(续)' : '')
      // v2.139.0（E8）：二阶公平读数就地并入这一行，**不新增控件 id**。
      //   理由：H2 门禁按 id 采集渲染控件再与 UI_BINDINGS 对账，新增一个 id 就要同步
      //   改守卫表；而这一行本就是「结算结果」的落点，把频率摘要挂在这里既不增面、
      //   也确实回答了用户唯一想知道的那个问题（他这轮排上了没有、长期匀不匀）。
      //   样本不足时如实说「样本不足」，不拿 0.000 冒充「非常平均」。
      + (function () { const fa = st.fairness || null;
        if (!fa) return '';
        if (fa.sd === null) return '·频率：样本不足（至少 2 人）';
        return '·频率 SD=' + fa.sd + (fa.fair === true ? '（公平）' : (fa.fair === false ? '（偏斜）' : ''))
          + (fa.throws ? '·⚠降级 ' + fa.throws + ' 次' : ''); })()
      , reason: r.reason }, true); renderBody(); });
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
      // v2.84.0：结算前**先问这条链现在允许结算吗**（settleBlockReason）。
      //   过去这里直接调 settle：链的行动还没发生（open／条件未足）时 settle 会静默成功，
      //   把「预测」写成既成事实——面板上看不出任何异常。现在被挡就如实输出原因码与阶段，
      //   使「不该结」和「结失败」在界面上可分辨。
      const chains = ((WA.store && WA.store.get ? WA.store.get() : {}) || {}).causal || {};
      const rowOfChain = function (id) {
        return (chains.chains || []).filter(function (y) { return y && y.id === id; })[0];
      };
      const ready = rows.filter(function (r) { return !WA.causal.settleBlockReason(rowOfChain(r.chain)); })[0];
      if (!ready) {
        const x = rowOfChain(rows[0].chain);
        return causalOut({ ok: false, reason: WA.causal.settleBlockReason(x) || 'missing-chain',
          id: 'due-' + rows.length + ':stage-' + ((x && x.stage) || '-') }, true);
      }
      const r = WA.causal.settle(ready.chain, ready.id, '');
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
    on('#wa-causal-ripple', () => {
      if (!WA.causal || typeof WA.causal.rippleWeb !== 'function') { causalOut({ ok: false, reason: 'module-missing' }); return; }
      const r = WA.causal.rippleWeb();
      if (r.ok === false) { causalOut({ ok: false, reason: r.reason }); return; }
      const lines = ['【后果涟漪网】链 ' + r.chains + ' ｜ 级联边 ' + r.edges.length + ' ｜ 深度 ' + r.depth + ' ｜ 终点 ' + r.endpoints];
      if (!r.edges.length) lines.push('无涟漪：没有已结算后果被后续链当新原因引用（如实报，不编造）。');
      r.edges.slice(0, 12).forEach(function (e) { lines.push('· ' + e.from + ' → ' + e.to + '（经 ' + e.via + '）'); });
      const oR = $('#wa-causal-out'); if (oR) oR.textContent = lines.join('\n');
    });
    on('#wa-causal-endings', () => {
      if (!WA.causal || typeof WA.causal.endingsTree !== 'function') { causalOut({ ok: false, reason: 'module-missing' }); return; }
      const r = WA.causal.endingsTree();
      if (r.ok === false) { causalOut({ ok: false, reason: r.reason }); return; }
      const lines = ['【多结局预演】在途链 ' + r.roots + ' ｜ 有因无果 ' + r.blocked];
      if (!r.leaves.length) lines.push('无在途链（所有链已到终态）。');
      r.leaves.slice(0, 12).forEach(function (l) {
        lines.push('· ' + l.id + '［' + l.stage + '］可达：' + l.reachable.join('/') + (l.blocked ? '（有因无果）' : ''));
      });
      lines.push('只列可达结局，不预测哪条会发生（叙事决定，不是引擎决定）。');
      const oE = $('#wa-causal-out'); if (oE) oE.textContent = lines.join('\n');
    });
    on('#wa-causal-trace', () => {
      if (!WA.causal || typeof WA.causal.traceGraph !== 'function') { causalOut({ ok: false, reason: 'module-missing' }); return; }
      const kf = ($('#wa-causal-trace-key') || {}).value || '';
      const r = WA.causal.traceGraph(String(kf).trim());
      const oT = $('#wa-causal-out'); if (!oT) return;
      if (r.ok === false) { oT.textContent = '未追溯：' + (r.reason || 'unknown') + (r.root ? ('（' + r.root + '）') : ''); return; }
      const lines = ['【因果追溯】根 ' + r.root + ' ｜ 节点 ' + r.nodes.length + ' ｜ 边 ' + r.edges.length + ' ｜ 模块 ' + r.modules.join('/')];
      r.nodes.slice(0, 12).forEach(function (n) { lines.push('  ' + n.kind + ' ' + n.label + (n.module ? ('（' + n.module + '）') : '')); });
      if (r.nodes.length > 12) lines.push('  …共 ' + r.nodes.length + ' 个节点');
      oT.textContent = lines.join('\n');
    });
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
    // v2.97.0（O9）：别名面（**名字可以有历史**）的面板绑定。
    //   为什么必须在这一层有出口：aliasOf / bindAlias / traceOf / aliasStat 四个口答的正是
    //   「改名之后旧引用还认不认得出」——四个口若没有真消费方，它们就是本仓库点名要摘的
    //   「零消费死面」（本仓库的判据从不信自述，只认调用点）。
    //   三类拒绝理由都必须看得见（它们在状态里都长得像「什么都没发生」）：
    //     · not-bound（规范名不在册：给不存在的人登记历史名 = 凭空造一个身份）；
    //     · name-taken（一个旧名只能有一个主人，否则同一行会解析出两种身份）；
    //     · too-deep / alias-cycle（链可以有深度但必须有边界：8 跳上限、不许成环）；
    //     · unknown-name（查不到就说查不到，不替它编一个规范名）。
    const aliasVal = function () { return ((($('#wa-id-aliasname') || {}).value) || '').trim(); };
    on('#wa-id-bindalias', () => {
      if (!WA.registry || typeof WA.registry.bindAlias !== 'function') return idOut({ reason: 'registry-missing' }, true);
      const was = aliasVal();
      if (!was) return idOut({ reason: 'missing-name' }, true);
      const r = WA.registry.bindAlias(idVal(), { was: was });
      idOut(r.ok ? { id: (r.reused ? '已登记过' : '已登记') + ':' + was + '→' + r.canonical + ':共' + (r.aliases || []).length + '个旧名' }
        : { reason: r.reason + (r.reason === 'name-taken' ? '(主人 ' + r.owner + ')' : '') + (r.reason === 'too-deep' ? '(已 ' + r.hops + ' 跳，上限 8)' : '') }, true);
      renderBody();
    });
    on('#wa-id-aliasof', () => {
      if (!WA.registry || typeof WA.registry.aliasOf !== 'function') return idOut({ reason: 'registry-missing' }, true);
      // 两个输入框任一有值即可查：身份区既有「人物姓名」也有「旧名」，
      //   而历史名恰恰是这两个框都可能填进去的那种名字。
      const nm = idVal() || aliasVal();
      if (!nm) return idOut({ reason: 'missing-name' }, true);
      const r = WA.registry.aliasOf(nm);
      if (!r.ok) return idOut({ reason: r.reason }, true);
      // traceOf 是第二步：aliasOf 答「尽头是谁」，traceOf 答「它是怎么走到那里的」。
      //   两句合一句就是失实——中间每一跳都得看得见。
      const t = WA.registry.traceOf(nm);
      const path = (t.ok && t.steps.length) ? t.steps.map(function (x) { return x.from + '→' + x.to; }).join('/', ) : '（一步到位）';
      idOut({ id: (r.isAlias ? '历史名' : '现名') + ':' + r.canonical + ':跳' + r.hops + ':' + path
        + ':名下旧名 ' + ((r.aliases || []).length) }, true);
      renderBody();
    });
    on('#wa-id-aliasstat', () => {
      if (!WA.registry || typeof WA.registry.aliasStat !== 'function') return idOut({ reason: 'registry-missing' }, true);
      const s = WA.registry.aliasStat();
      idOut({ id: '改名台账 ' + s.pairs + ' 对 / ' + s.owners + ' 人 / 旧名 ' + s.names
        + ' / 最深 ' + s.maxDepth + '（上限 ' + s.maxHops + '）'
        + (s.pairs ? '：' + s.rows.map(function (x) { return x.was + '→' + x.canonical; }).join('、') : '（尚无改名记录）') }, true);
    });
    // v2.97.0（X5）：跨插件因果桥（**入站边**）的面板绑定。
    //   与上面的「传播与辟谣」同规格：三类拒绝理由都必须看得见——它们在世界状态里
    //   同样长得像「什么都没发生」：
    //     · unknown-act（不认识的动作，不照收）/ missing-op（没带 opNo，认不出是哪一笔）；
    //     · disabled（桥关着 ⇒ 上报**不落盘也不排队**，那笔操作当场丢了，不是「以后会补上」）；
    //     · unknown-chain（接一条不存在的链 = 用桥给世界造一条因果）/
    //       already-linked（已接过别的链，不覆盖）/ link-off（接链开关关着）/ ops-full（台账满，不静默挤掉）。
    const pbOut = function (r) { return plainOut('wa-pb-out', 'pbOut', r); };
    if (panelEl.dataset.pbOut) { const o = $('#wa-pb-out'); if (o) o.textContent = panelEl.dataset.pbOut; }
    { const el = $('#wa-pb-enabled');
      if (el) el.onchange = function () {
        if (!WA.phoneBridge) return pbOut({ ok: false, reason: 'module-missing' });
        WA.phoneBridge.setSettings({ enabled: !!el.checked });
        // 开闸/关闸都要把相位念出来：关着的时候「手机侧还在推」这句话必须看得见，
        //   否则用户会以为「关掉 = 暂存」，而实际是「那几笔已经丢了」。
        const p = WA.phoneBridge.phaseOf();
        pbOut({ ok: true, id: (el.checked ? 'enabled' : 'disabled') + ':phase-' + p.phase });
      }; }
    on('#wa-pb-note', () => {
      if (!WA.phoneBridge) return pbOut({ ok: false, reason: 'module-missing' });
      // opId 留空时**不替它编一个**：凭空的 opId 会让幂等失效（每次点击都成了「新的一笔」），
      //   那是比 missing-op 更坏的默认值——缺就照实报缺。
      const r = WA.phoneBridge.noteAction({ opId: wv('#wa-pb-opid'), act: wv('#wa-pb-act'), to: wv('#wa-pb-to'), from: '本机' });
      pbOut(Object.assign({}, r, { id: r.ok ? ((r.reused ? '已收下过（幂等）' : '已记一笔') + ':' + r.act + ':' + r.id) : r.reason }));
      if (r.ok && r.opId) panelEl.dataset.pbOpId = r.opId;
      renderBody();
    });
    on('#wa-pb-view', () => {
      if (!WA.phoneBridge) return pbOut({ ok: false, reason: 'module-missing' });
      const st = WA.phoneBridge.stat();
      const v = WA.phoneBridge.opsView(6);
      const p = WA.phoneBridge.phaseOf();
      const rows = v.items.map(function (x) { return x.actLabel + (x.to ? '→' + x.to : '') + (x.chainId ? '@' + x.chainId : '·未接链'); }).join('、');
      // traceOf 是**反方向**的那一问（链 → 它背后那几笔手机操作），与 opTrace（操作 → 链）配对。
      //   计划判据写的是「evidence() 可把链回放到手机操作记录」——那正是这个方向；
      //   面板把它摆在台账旁边，是为了让「这条链的因是不是手机侧」一眼可答。
      const chains = {};
      v.items.forEach(function (x) { if (x.chainId) chains[x.chainId] = true; });
      const traces = Object.keys(chains).slice(0, 3).map(function (cid) {
        const tr = WA.phoneBridge.traceOf(cid);
        return cid + '←' + (tr.items || []).map(function (y) { return y.actLabel; }).join('+') + '(' + tr.count + ')';
      }).join('；');
      pbOut({ ok: true, id: '台账 ' + v.rows + '/' + st.maxOps + '：未接链 ' + st.unlinked
        + '｜相位 ' + p.phase + '｜最近：' + (rows || '无')
        + (traces ? '｜链回放：' + traces : '') });
    });
    on('#wa-pb-link', () => {
      if (!WA.phoneBridge) return pbOut({ ok: false, reason: 'module-missing' });
      // 操作号沿用「记一笔」缓存的那一笔（与 rumor 的链 id 同规格：renderBody 会把输入框重建回空值，
      //   不留缓存的话「先记一笔、再接链」这个最自然的顺序会在第二击时变成 missing-fields）。
      const opId = wv('#wa-pb-opid') || panelEl.dataset.pbOpId || '';
      const r = WA.phoneBridge.linkChain(opId, wv('#wa-pb-chain'));
      pbOut(Object.assign({}, r, { id: r.ok ? (r.already ? '已接过同一条链' : '已接链') + ':' + r.opId + '@' + r.chainId
        : (r.reason + (r.want ? '（现有 ' + r.chainId + '，想接 ' + r.want + '）' : '')) }));
      renderBody();
    });
    on('#wa-pb-trace', () => {
      if (!WA.phoneBridge) return pbOut({ ok: false, reason: 'module-missing' });
      const opId = wv('#wa-pb-opid') || panelEl.dataset.pbOpId || '';
      const r = WA.phoneBridge.opTrace(opId);
      pbOut(r.ok ? { ok: true, id: r.actLabel + (r.linked ? '：已接链 ' + r.chainId : '：尚未接链（手机侧的那笔世界里的因还没被指认）') }
        : { ok: false, reason: r.reason });
    });

    // v2.63.0：世界织体 / 社交漩涡 / 悬案三面的面板绑定。
    //   三面各自的关键**拒绝理由**都必须看得见——它们在世界状态里都长得像「什么都没发生」：
    //     · world   —— unknown-place（地点没登记，不猜）/ unreachable（路没登记，不抄近路）
    //                  / scheduled-elsewhere（此时人在别处，不重叠）；
    //     · shadow  —— no-shadow / shadow-closed（没有可加深的秘密，不凭空升级）；
    //     · threads —— no-basis（不得凭空结案）/ conflicts-unresolved（矛盾不得被平均）。
    const wv = function (id) { return ((($(id) || {}).value) || '').trim(); };
    const chOut = function (r) { return plainOut('wa-ch-out', 'chronoOut', r); };
    if (panelEl.dataset.chronoOut) { const o = $('#wa-ch-out'); if (o) o.textContent = panelEl.dataset.chronoOut; }
    { const el = $('#wa-ch-enabled');
      if (el) el.onchange = function () {
        if (!WA.chrono) return chOut({ ok: false, reason: 'module-missing' });
        WA.chrono.setSettings({ enabled: !!el.checked });
        chOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    on('#wa-ch-record', () => {
      if (!WA.chrono) return chOut({ ok: false, reason: 'module-missing' });
      const r = WA.chrono.record(wv('#wa-ch-anchor'), wv('#wa-ch-base') || null, { note: wv('#wa-ch-note') });
      if (r.ok) panelEl.dataset.chronoId = r.id;
      chOut(Object.assign({}, r, { id: r.ok ? (r.id + ':layer-' + r.layer) : r.reason }));
    });
    on('#wa-ch-stale', () => {
      if (!WA.chrono) return chOut({ ok: false, reason: 'module-missing' });
      const rows = WA.chrono.stale() || [];
      const st = WA.chrono.stat();
      chOut({ ok: true, id: '失准 ' + rows.length + ' / 层 ' + st.layers + (rows.length ? '：' + rows.slice(0, 8).map(function (x) { return x.id || x.anchor || x; }).join('、') : '（空）') });
    });
    on('#wa-ch-undo', () => {
      if (!WA.chrono) return chOut({ ok: false, reason: 'module-missing' });
      const id = wv('#wa-ch-base') || panelEl.dataset.chronoId || '';
      const r = WA.chrono.undo(id);
      chOut(r.ok ? { ok: true, id: '试算 ' + r.target + ' → 将失准 ' + ((r.affected || []).length) + '（不写世界）' } : r);
    });
    on('#wa-ch-apply', () => {
      if (!WA.chrono) return chOut({ ok: false, reason: 'module-missing' });
      const id = wv('#wa-ch-base') || panelEl.dataset.chronoId || '';
      const r = WA.chrono.applyUndo(id, { confirm: true });
      chOut(Object.assign({}, r, { id: r.ok ? ('已撤销 ' + r.revert) : r.reason }));
    });
    const coOut = function (r) { return plainOut('wa-co-out', 'collabOut', r); };
    if (panelEl.dataset.collabOut) { const o = $('#wa-co-out'); if (o) o.textContent = panelEl.dataset.collabOut; }
    { const el = $('#wa-co-enabled');
      if (el) el.onchange = function () {
        if (!WA.collab) return coOut({ ok: false, reason: 'module-missing' });
        WA.collab.setSettings({ enabled: !!el.checked });
        coOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    on('#wa-co-open', () => {
      if (!WA.collab) return coOut({ ok: false, reason: 'module-missing' });
      const r = WA.collab.open(wv('#wa-co-sid') || wv('#wa-co-who') || 'session');
      if (r.ok) panelEl.dataset.collabSid = r.session;
      if (r.ok && $('#wa-co-sid')) $('#wa-co-sid').value = r.session;
      coOut(Object.assign({}, r, { id: r.ok ? ('会话 ' + r.session) : r.reason }));
    });
    on('#wa-co-claim', () => {
      if (!WA.collab) return coOut({ ok: false, reason: 'module-missing' });
      const sid = wv('#wa-co-sid') || panelEl.dataset.collabSid || '';
      const r = WA.collab.claim(wv('#wa-co-who'), sid);
      coOut(Object.assign({}, r, { id: r.ok ? ('占用 ' + r.actor) : (r.reason + (r.holder ? '（持有者 ' + r.holder + '）' : '')) }));
    });
    on('#wa-co-pending', () => {
      if (!WA.collab) return coOut({ ok: false, reason: 'module-missing' });
      const rows = WA.collab.pending() || [];
      const st = WA.collab.stat();
      coOut({ ok: true, id: '待重放 ' + rows.length + ' / 开会话 ' + st.openSessions });
    });
    on('#wa-co-conflicts', () => {
      if (!WA.collab) return coOut({ ok: false, reason: 'module-missing' });
      const rows = (WA.collab.conflicts() || []).filter(function (c) { return c.open; });
      coOut({ ok: true, id: '未裁决 ' + rows.length + (rows.length ? '：' + rows.slice(0, 6).map(function (c) { return c.actor; }).join('、') : '') });
    });
    // v2.139.0（E10）：协作任务与违约（六口的真产品消费方 —— 每口至少一个）。
    const tkOut = function (r) { return plainOut('wa-task-out', 'taskOut', r); };
    if (panelEl.dataset.taskOut) { const o = $('#wa-task-out'); if (o) o.textContent = panelEl.dataset.taskOut; }
    // 参与人文本 → 结构化：`甲:3,乙:3`。冒号后非正数视为未承诺（不猜一个默认量）。
    const tkPartners = function () {
      return (wv('#wa-task-partners') || '').split(',').map(function (s) { return s.trim(); })
        .filter(function (s) { return !!s; })
        .map(function (s) {
          const i = s.indexOf(':');
          if (i < 0) return s;
          return { name: s.slice(0, i).trim(), pledge: Number(s.slice(i + 1).trim()) };
        });
    };
    on('#wa-task-create', () => {
      if (!WA.collab || !WA.collab.createTask) return tkOut({ ok: false, reason: 'module-missing' });
      const sec = Number(wv('#wa-task-deadline'));
      // 截止是**世界时钟刻度**，而用户只该说「多久之后」——换算放在这一层，不让面板泄漏刻度语义。
      //   时间源走 clockNow（决策时间单一出口）：裸调 Date.now() 会被 G20 门禁抓，
      //   且冻结世界钟时面板算出的截止会与 collab 的判定时钟不同源。
      const dl = (isFinite(sec) && sec > 0) ? (clockNow('panel.task') + sec * 1000) : NaN;
      const r = WA.collab.createTask(tkPartners(), wv('#wa-task-goal'), dl);
      if (r.ok && $('#wa-task-id')) $('#wa-task-id').value = r.task;
      tkOut(r.ok ? { ok: true, id: r.task + '（' + r.faction + ' · ' + r.partners.join('、') + '）' } : r);
    });
    on('#wa-task-contribute', () => {
      if (!WA.collab || !WA.collab.contribute) return tkOut({ ok: false, reason: 'module-missing' });
      const r = WA.collab.contribute(wv('#wa-task-person'), wv('#wa-task-id'), Number(wv('#wa-task-amount')));
      tkOut(r.ok ? { ok: true, id: r.person + ' → ' + r.task + ' 累计 ' + r.contributed } : r);
    });
    on('#wa-task-settle', () => {
      if (!WA.collab || !WA.collab.settle) return tkOut({ ok: false, reason: 'module-missing' });
      const r = WA.collab.settle(wv('#wa-task-id'));
      if (!r.ok) return tkOut(r);
      tkOut(r.already ? { ok: true, id: '已结算过（不重复记违约）' }
        : { ok: true, id: r.breached ? ('违约 ' + r.missed.length + ' 人：' + r.missed.join('、') + '（只记不罚）') : '全部履约' });
    });
    on('#wa-task-penalize', () => {
      if (!WA.collab || !WA.collab.penalize) return tkOut({ ok: false, reason: 'module-missing' });
      const r = WA.collab.penalize(wv('#wa-task-id'), wv('#wa-task-person') || null, '粮', Number(wv('#wa-task-amount')));
      const refused = (r.rows || []).filter(function (x) { return !x.ok; });
      tkOut(r.ok ? { ok: true, id: '罚没 ' + r.applied + ' 人 → ' + r.faction
        + (refused.length ? '（部分被拒：' + refused.map(function (x) { return x.name + ':' + x.reason; }).join('、') + '）' : '') } : r);
    });
    on('#wa-task-view', () => {
      if (!WA.collab || !WA.collab.taskStat) return tkOut({ ok: false, reason: 'module-missing' });
      const st = WA.collab.taskStat();
      tkOut({ ok: true, id: '活跃 ' + st.active + ' / 完成 ' + st.completed + ' / 违约 ' + st.breached
        + '（记 ' + st.breachRecorded + ' · 罚 ' + st.penalized + '）'
        + (st.rows.length ? '：' + st.rows.slice(-3).map(function (t) { return t.id + (t.short.length ? '(' + t.short.join('/') + '欠)' : '✓'); }).join('、') : '') });
    });
    const plOut = function (r) { return plainOut('wa-pl-out', 'pluginOut', r); };
    on('#wa-pl-reg', () => {
      if (!WA.plugin) return plOut({ ok: false, reason: 'module-missing' });
      const name = wv('#wa-pl-name') || 'demo';
      const r = WA.plugin.register({
        name: name,
        version: '0',
        hooks: {
          beforeSave: function (ctx) {
            this.log('intercepted save');
            return { ok: true };
          }
        }
      });
      plOut(r);
    });
    on('#wa-pl-unreg', () => {
      if (!WA.plugin) return plOut({ ok: false, reason: 'module-missing' });
      const name = wv('#wa-pl-name');
      if (!name) return plOut({ ok: false, reason: 'empty-name（卸载必须给定名字，不猜）' });
      const r = WA.plugin.unregister(name);
      plOut(r.ok ? { ok: true, removed: r.name, left: WA.plugin.list().length }
        : { ok: false, reason: r.reason === 'not-found' ? 'not-found（这个名字没注册过）' : r.reason });
    });
    on('#wa-pl-list', () => {
      if (!WA.plugin) return plOut({ ok: false, reason: 'module-missing' });
      plOut({ ok: true, list: WA.plugin.list() });
    });
    on('#wa-pl-fire', () => {
      if (!WA.plugin) return plOut({ ok: false, reason: 'module-missing' });
      plOut(WA.plugin.stat());
    });
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
    on('#wa-world-transit', () => {
      if (!WA.world || !WA.world.transit) return worldOut({ ok: false, reason: 'module-missing' });
      const ch = wv('#wa-world-tr-ch');
      const r = WA.world.transit(ch, wv('#wa-world-mv-from'), wv('#wa-world-mv-to'));
      if (!r.ok) {
        // 「被封住」与「本来就不达」是两件事，**不得合成一句「不行」**。
        const txt = r.reason === 'weather-blocked'
          ? ('通行 · 被封 · ' + r.channel + ' ' + r.from + '→' + r.to + '：' + r.kind + ' 封住 ' + r.at
            + '（人/物不可，消息可）')
          : ('通行 · ' + (r.reason || 'unknown'));
        panelEl.dataset.worldOut = txt;
        const o = $('#wa-world-out'); if (o) o.textContent = txt;
        return;
      }
      const wx = r.weather ? (r.path.join('→') + ' · ' + r.weather.kind + ' ×' + r.weather.factor) : '未登记天气';
      worldOut(Object.assign({}, r, { id: '通行 · ' + r.channel + ' ' + r.path.join('→') + '（' + wx + '）' }));
    });
    on('#wa-world-canbe', () => {
      if (!WA.world) return worldOut({ ok: false, reason: 'module-missing' });
      const r = WA.world.canBeAt(wv('#wa-world-mv-who'), wv('#wa-world-mv-to'), clockNow('ui.world'));
      worldOut(r.ok ? Object.assign({}, r, { id: '在场许可' }) : r);
    });
    // ── v2.117.0（计划二 B2 前半）：场所用途与时间窗口 ──
    //   三个入口各自分开：登记（写）/ 看名单（只读）/ 查某一用途（只读）。
    //   「地点没登记」与「登记了但没有这个用途」是**两件事**，不得合成一句「没有」。
    const usePlace = function () { return wv('#wa-world-use-place') || wv('#wa-world-place'); };
    const useOut = function (r) {
      const o = $('#wa-world-use-out');
      if (!o) return;
      if (r && r.ok && Array.isArray(r.uses)) {
        o.textContent = r.place + '：' + (r.uses.length
          ? r.uses.map(function (x) { return x.use + '[' + x.open + '~' + x.close + (x.note ? ' ' + x.note : '') + ']'; }).join(' ')
          : '未登记任何用途窗口（该地点仍按自身开闭判定）');
        return;
      }
      if (r && r.ok && r.found === false) { o.textContent = r.place + ' 未登记「' + r.use + '」用途 ⇒ 回落地点自身开闭 [' + r.open + '~' + r.close + ']'; return; }
      if (r && r.ok) { o.textContent = r.place + '「' + r.use + '」窗口 [' + r.open + '~' + r.close + ']' + (r.existed ? '（已更新）' : '（新增）'); return; }
      const why = (r && r.reason) || 'unknown';
      // 拒收理由逐条讲清楚：三件事的修法完全不同。
      const extra = why === 'bad-use' ? '（可选：' + ((r && r.uses) || []).join('/') + '）'
        : why === 'unknown-place' ? '（地点没登记：先去上面登记地点）'
        : why === 'bad-time' ? '（起止须为有限数且 关 > 开）'
        : why === 'missing-fields' ? '（地点与用途都要填）' : '';
      o.textContent = '未登记：' + why + extra;
    };
    on('#wa-world-use-add', () => {
      if (!WA.world || !WA.world.addUse) return useOut({ ok: false, reason: 'module-missing' });
      const r = WA.world.addUse(usePlace(), { use: wv('#wa-world-use-kind'),
        open: wv('#wa-world-use-open'), close: wv('#wa-world-use-close'), note: wv('#wa-world-use-note') });
      useOut(r);
    });
    on('#wa-world-use-list', () => {
      if (!WA.world || !WA.world.usesOf) return useOut({ ok: false, reason: 'module-missing' });
      useOut(WA.world.usesOf(usePlace()));
    });
    on('#wa-world-use-win', () => {
      if (!WA.world || !WA.world.useWindowOf) return useOut({ ok: false, reason: 'module-missing' });
      useOut(WA.world.useWindowOf(usePlace(), wv('#wa-world-use-kind')));
    });
    // ── v2.117.0（计划二 B1 主体）：人物行动 ──
    //   七个入口一律走真 API，且**不替模块编造默认值**：人物默认向人物生活区借（那里正在编辑的人），
    //   目标 id 取该人第一个 active 目标（行动必须有目标来源，没有来源就不许开工）。
    const actOut = function (r) { return plainOut('wa-act-out', 'actOut', r); };
    const actGoalOf = function (waPerson) {
      try {
        const p = (WA.store.get().people || {})['p_' + waPerson];
        const gs = (p && p.life && Array.isArray(p.life.goals)) ? p.life.goals : [];
        const g = gs.filter(function (x) { return x && x.status === 'active'; })[0];
        return g ? g.id : '';
      } catch (e) { return ''; }
    };
    on('#wa-act-add', () => {
      if (!WA.act) return actOut({ ok: false, reason: 'module-missing' });
      const who = wv('#wa-act-person') || (($('#wa-life-person') || {}).value || '').trim();
      const r = WA.act.add(who, { kind: wv('#wa-act-kind'), text: wv('#wa-act-text'),
        goalId: actGoalOf(who), with: wv('#wa-act-with'), target: wv('#wa-act-with'),
        item: wv('#wa-act-item'), amount: wv('#wa-act-amount'), place: wv('#wa-act-place'),
        from: wv('#wa-act-from'), to: wv('#wa-act-to'), use: wv('#wa-act-use'),
        duration: wv('#wa-act-dur') });
      // 登记成功时把新 id 回填到 id 框——下一件事（准入/结算/中止）都要它，
      //   否则用户得从台账里自己抄一遍，那是把「回填」这件机械活推给人。
      if (r && r.ok) { const el = $('#wa-act-id'); if (el) el.value = r.id; }
      actOut(r.ok ? Object.assign({}, r, { id: r.id + ' 时长 ' + r.duration + 'ms' }) : r);
      renderBody();
    });
    on('#wa-act-admit', () => {
      if (!WA.act) return actOut({ ok: false, reason: 'module-missing' });
      const r = WA.act.admit(wv('#wa-act-id'), clockNow('ui.act'));
      if (r && r.ok) {
        const bits = ['已开工', r.opId];
        if (r.travel) bits.push('路程 ' + r.travel.minutes + ' 分钟');
        if (r.window) bits.push('窗口至 ' + r.window.until);
        actOut(Object.assign({}, r, { id: bits.join(' · ') }));
      } else actOut(r);
      renderBody();
    });
    on('#wa-act-advance', () => {
      if (!WA.act) return actOut({ ok: false, reason: 'module-missing' });
      const r = WA.act.advance(clockNow('ui.act'));
      // 「本轮到期几件」与「为什么没结算」分开报——只报前者会让「零件」永远说不出原因。
      actOut({ ok: !!r.ok, id: '完成 ' + r.completed + ' / 失败 ' + r.failed + ' / 仍在途 ' + r.still
        + ' / 超额留痕 ' + ((r.deferred || []).length) + ' / 重放忽略 ' + r.duplicates + '（' + r.reason + '）',
        reason: r.ok ? '' : r.reason });
      renderBody();
    });
    on('#wa-act-abort', () => {
      if (!WA.act) return actOut({ ok: false, reason: 'module-missing' });
      const r = WA.act.abort(wv('#wa-act-id'), wv('#wa-act-text') || '手动中止', clockNow('ui.act'));
      actOut(r.ok ? Object.assign({}, r, { id: '已中止 · 已消耗 ' + r.spent + 'ms / 未执行 ' + r.left + 'ms'
        + (r.halted ? ' · 行程已标中止（位置未知）' : '') }) : r);
      renderBody();
    });
    on('#wa-act-replan', () => {
      if (!WA.act) return actOut({ ok: false, reason: 'module-missing' });
      const from = wv('#wa-act-id');
      const who = wv('#wa-act-person') || (($('#wa-life-person') || {}).value || '').trim();
      const r = WA.act.replan(from, { kind: wv('#wa-act-kind'), text: wv('#wa-act-text'),
        with: wv('#wa-act-with'), target: wv('#wa-act-with'), item: wv('#wa-act-item'),
        amount: wv('#wa-act-amount'), place: wv('#wa-act-place'),
        from: wv('#wa-act-from'), to: wv('#wa-act-to'), use: wv('#wa-act-use'),
        duration: wv('#wa-act-dur') }, clockNow('ui.act'));
      if (r && r.ok) { const el = $('#wa-act-id'); if (el) el.value = r.id; }
      actOut(r.ok ? Object.assign({}, r, { id: r.id + '（原计划 ' + (r.replannedFrom || from) + ' 已标改计划）' }) : r);
      renderBody();
    });
    on('#wa-act-view', () => {
      if (!WA.act) return actOut({ ok: false, reason: 'module-missing' });
      const v = WA.act.view({ limit: 8 });
      // 无确认器的种类**如实带出**：诊断不许把它显示成「正常无事」。
      const rows = (v.recent || []).map(function (x) {
        return x.id + ' ' + x.person + '/' + x.kind + ' ' + x.status
          + (x.result ? '（' + x.result + '）' : '') + (x.reason ? ' 因 ' + x.reason : '');
      });
      // v2.117.0：累计读数同一条出口。`stat` 回答的是「这一路各阶段各拒收过几次」，
      //   与上面的「现在剩几条」是同一件事的即时面与累计面 —— 分开占两个控件反而要让用户
      //   自己把两处读数拼起来。faults 是**按拒收码分列**的（不是总数），
      //   否则「受阻过 7 次」永远说不出是哪一类受阻。
      const st = WA.act.stat ? WA.act.stat() : null;
      const fl = (st && st.faults) ? Object.keys(st.faults).map(function (k) { return k + '×' + st.faults[k]; }).join(' ') : '';
      actOut({ ok: true, id: '共 ' + v.total + ' 条 / 进行中 ' + v.open + ' / 回执 ' + v.receipts
        + ' · 状态 ' + JSON.stringify(v.byStatus) + ' · 无确认器 ' + v.noConfirmer.join('/')
        + (st ? ' · 累计 登记' + st.added + '/准入' + st.admitted + '/完成' + st.completed + '/失败' + st.failed
          + '/中止' + st.aborted + '/改计划' + st.replanned + '/重放' + st.duplicates + '/无确认器' + st.unconfirmed
          + (fl ? ' · 拒收 ' + fl : '') : '')
        + (rows.length ? ' ｜ ' + rows.join(' ； ') : '') });
    });
    // v2.141.0（F2）：合法不行动。判「这一笔的结果属于哪一档」——四档不可合并。
    //   输入框复用「行动 id」旁的种类框：填种类判未受阻档，填「种类@拒收码」判受阻档。
    on('#wa-act-verdict', () => {
      if (!WA.act || !WA.act.verdict) return actOut({ ok: false, reason: 'module-missing' });
      const raw = wv('#wa-act-kind');
      const at = raw.indexOf('@');
      const kind = at >= 0 ? raw.slice(0, at).trim() : raw.trim();
      const blockedReason = at >= 0 ? raw.slice(at + 1).trim() : '';
      const r = WA.act.verdict(kind, blockedReason ? { blockedReason: blockedReason } : {});
      actOut(r);
    });
    { const el = $('#wa-act-enabled');
      if (el) el.onchange = function () {
        if (!WA.act) return actOut({ ok: false, reason: 'module-missing' });
        WA.act.setSettings({ enabled: !!el.checked });
        actOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    // ── v2.119.0（拓展计划 ①）：人物多步计划与受挫重决策 ──
    //   面板只做「登记与结算」，**不替人物挑替代路**：改选必须显式提交新步骤（rechoose），
    //   本区没有「自动选一条 fallback」的按钮 —— 有的话「他为什么改主意」就永远答不出。
    const planOut = function (r) { return plainOut('wa-plan-out', 'planOut', r); };
    const planWho = function () { return wv('#wa-plan-person'); };
    const planSteps = function () {
      // 行格式：`1(move)搭船去乙地 前置:0 需要:银元×3 地点:码头 受阻改走:改走陆路`
      //   解析失败**不补默认值** —— 坏行照实交给引擎，由它报 bad-step（面板不替用户猜意图）。
      return String((($('#wa-plan-steps') || {}).value) || '').split('\n').map(function (line) {
        const raw = line.trim();
        if (!raw) return null;
        const head = raw.match(/^(\d+)\s*(?:[（(]([^）)]*)[）)])?\s*(.*)$/);
        if (!head) return null;
        const text = (head[3] || '').split(/\s+(?=前置[:：]|需要[:：]|地点[:：]|受阻改走[:：])/)[0].trim();
        const step = { kind: head[2] || 'step', text: text };
        const take = function (re) { const m = raw.match(re); return m ? m[1].trim() : ''; };
        const need = take(/需要[:：]\s*([^\s×]+×\d+)/);
        if (need) { const mm = need.split('×'); step.need = { resource: mm[0], amount: Number(mm[1]) }; }
        const after = take(/前置[:：]\s*(\d+)/);
        if (after) step.after = after;
        const place = take(/地点[:：]\s*([^\s]+)/);
        if (place) step.place = place;
        const fb = take(/受阻改走[:：]\s*([^\n]+)/);
        if (fb) step.fallback = fb;
        return step;
      }).filter(Boolean);
    };
    if (panelEl.dataset.planOut) { const o = $('#wa-plan-out'); if (o) o.textContent = panelEl.dataset.planOut; }
    { const el = $('#wa-plan-enabled');
      if (el) el.onchange = function () {
        if (!WA.plan) return planOut({ ok: false, reason: 'module-missing' });
        WA.plan.setSettings({ enabled: !!el.checked });
        planOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    on('#wa-plan-expand', () => {
      if (!WA.plan) return planOut({ ok: false, reason: 'module-missing' });
      const who = planWho();
      // 目标留空 ⇒ 取该人第一个 active 目标（**只读**该人自己的 life.goals，不做模糊猜）。
      let goalId = wv('#wa-plan-goal');
      if (!goalId && who) {
        try {
          const p = ((WA.store.get() || {}).people || {})['p_' + who] || {};
          const g = ((p.life && p.life.goals) || []).filter(function (x) { return x && x.status === 'active'; })[0];
          goalId = (g && g.id) || '';
        } catch (e) { goalId = ''; }
      }
      const r = WA.plan.expand(who, goalId, planSteps());
      planOut(r.ok ? Object.assign({}, r, { id: r.id + '（' + r.steps + ' 步）' }) : r);
    });
    on('#wa-plan-current', () => {
      if (!WA.plan) return planOut({ ok: false, reason: 'module-missing' });
      const r = WA.plan.current(planWho());
      planOut(r.ok ? Object.assign({}, r, { id: '第 ' + r.seq + ' 步（' + r.kind + '）' + r.text }) : r);
    });
    on('#wa-plan-advance', () => {
      if (!WA.plan) return planOut({ ok: false, reason: 'module-missing' });
      const r = WA.plan.advance(planWho());
      planOut(r.ok ? Object.assign({}, r, { id: '第 ' + r.seq + ' 步已登记开工：' + r.text }) : r);
    });
    const planSettle = function (kind) {
      if (!WA.plan) return planOut({ ok: false, reason: 'module-missing' });
      const r = WA.plan.settle(planWho(), kind, { reason: wv('#wa-plan-reason') });
      planOut(r.ok ? Object.assign({}, r, { id: kind + ' · 下一步 ' + (r.next < 0 ? '（无）' : r.next) + ' · 尝试 ' + r.tries }) : r);
    };
    on('#wa-plan-done', () => planSettle('done'));
    on('#wa-plan-blocked', () => planSettle('blocked'));
    on('#wa-plan-refused', () => planSettle('refused'));
    on('#wa-plan-candidates', () => {
      if (!WA.plan) return planOut({ ok: false, reason: 'module-missing' });
      const r = WA.plan.candidates(planWho());
      // 余量用尽时**照实带出**：调用方该知道「他没有余量了」。
      planOut(r.ok ? Object.assign({}, r, { id: '受阻「' + r.stuck.text + '」→ ' + r.hint
        + ' · 余量 ' + r.tries + (r.exhausted ? '（已用尽）' : '') }) : r);
    });
    on('#wa-plan-view', () => {
      if (!WA.plan) return planOut({ ok: false, reason: 'module-missing' });
      const v = WA.plan.view(planWho());
      if (!v.ok) return planOut(v);
      const rows = v.steps.map(function (s) {
        return s.seq + '(' + s.kind + ')' + s.text + '[' + s.status + ']'
          + (s.afterSeq >= 0 ? ' 前置' + s.afterSeq : '')
          + (s.need ? ' 需要 ' + s.need.resource + '×' + s.need.amount : '');
      });
      const st = WA.plan.statView();
      // v2.127.0（X1）：把意图链读数一并带出。此前 `chain` 只有定义没有外部读者 ——
      //   而「他在第几步、缺什么前置、漂移没有」正是操作者按下「查看」时要知道的东西。
      //   读不出来就如实说读不出来（不拿 view 的读数冒充链接论）。
      let link = '';
      try {
        const c = WA.plan.chain(planWho());
        if (c.ok) {
          link = ' ｜ 第 ' + ((c.step && c.step.seq) || 0) + '/' + c.total + ' 步'
            + (c.blockedBy.length ? ' 卡在 ' + c.blockedBy.map(function (b) {
                return b.kind === 'need' ? '缺 ' + b.detail : '前置第 ' + b.seq + ' 步'; }).join('、') : '')
            + (c.rest.length ? ' 之后还有 ' + c.rest.length + ' 步' : '')
            + (c.drift ? '（next 已漂移：' + c.goalNext + '）' : '');
        } else {
          link = ' ｜ 意图链：' + c.reason;
        }
      } catch (e) { link = ''; }
      planOut({ ok: true, id: v.goalText + ' · ' + v.status + ' · 尝试 ' + v.tries
        + ' · 共 ' + st.rows + ' 条计划（受阻 ' + st.blocked + '）' + link
        + (rows.length ? ' ｜ ' + rows.join(' ； ') : '') });
    });
    on('#wa-plan-abandon', () => {
      if (!WA.plan) return planOut({ ok: false, reason: 'module-missing' });
      const r = WA.plan.abandon(planWho(), wv('#wa-plan-reason'));
      planOut(r.ok ? Object.assign({}, r, { id: '已放弃（留痕，不删行）' }) : r);
    });
    // ── v2.119.0（拓展计划 ②）：关系修复与破裂 ──
    //   四道门全在引擎侧判；面板**只转发操作者写下的依据**，绝不替操作者假定「对方接受了」：
    //   `acceptedBy` 在场 ⇒ 道歉那一格依据在场；`evidence` 在场 ⇒ 补偿回执 / 守约证据在场。
    //   依据不在场就由引擎如实报 not-accepted / no-receipt / not-kept（面板不许代填）。
    const mendOut = function (r) { return plainOut('wa-mend-out', 'mendOut', r); };
    const mendId = function () { return wv('#wa-mend-id2'); };
    if (panelEl.dataset.mendOut) { const o = $('#wa-mend-out'); if (o) o.textContent = panelEl.dataset.mendOut; }
    { const el = $('#wa-mend-enabled');
      if (el) el.onchange = function () {
        if (!WA.mend) return mendOut({ ok: false, reason: 'module-missing' });
        WA.mend.setSettings({ enabled: !!el.checked });
        mendOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    on('#wa-mend-mark', () => {
      if (!WA.mend) return mendOut({ ok: false, reason: 'module-missing' });
      const r = WA.mend.mark(wv('#wa-mend-person'), { with: wv('#wa-mend-with'), hurt: wv('#wa-mend-hurt') });
      if (r.ok) { const el = $('#wa-mend-id2'); if (el) el.value = r.id; }
      mendOut(r.ok ? Object.assign({}, r, { id: r.id + '（伤的是：' + r.hurt + '）' }) : r);
    });
    const mendStep = function (kind) {
      if (!WA.mend) return mendOut({ ok: false, reason: 'module-missing' });
      const acceptedBy = wv('#wa-mend-acceptby'), evidence = wv('#wa-mend-evidence');
      const r = WA.mend.step(wv('#wa-mend-person'), mendId(), kind, {
        accepted: kind === 'apology' ? (!!acceptedBy) : undefined,
        acceptedBy: acceptedBy,
        receipt: kind === 'restitution' ? (!!evidence) : undefined,
        kept: kind === 'keeping' ? (!!evidence) : undefined,
        by: wv('#wa-mend-guarantor'),
        evidence: evidence });
      mendOut(r.ok ? Object.assign({}, r, { id: kind + ' 进度 ' + r.progress + '/' + r.need
        + (r.repeated ? '（同格重复：格数即格数）' : '') }) : r);
    };
    on('#wa-mend-apology', () => mendStep('apology'));
    on('#wa-mend-restitution', () => mendStep('restitution'));
    on('#wa-mend-keeping', () => mendStep('keeping'));
    on('#wa-mend-guarantee', () => mendStep('guarantee'));
    on('#wa-mend-view', () => {
      if (!WA.mend) return mendOut({ ok: false, reason: 'module-missing' });
      const v = WA.mend.view(wv('#wa-mend-person'), wv('#wa-mend-with'));
      if (!v.ok) return mendOut(v);
      const st = WA.mend.statView();
      const done = v.acts.filter(function (a) { return a.done; }).map(function (a) { return a.kind; });
      mendOut({ ok: true, id: v.person + '↔' + v.with + ' · ' + v.hurt + ' · ' + v.status
        + ' · 进度 ' + v.progress + '/' + v.need
        + ' · 已做 ' + (done.length ? done.join('/') : '无')
        + ' · 尚缺 ' + (v.missing.length ? v.missing.join('、') : '无')
        + ' · 关系 ' + (v.relation ? (v.relation.ok ? '已生效' : '未生效：' + v.relation.reason) : '未触发')
        + ' · 共 ' + st.rows + ' 条修复（未结 ' + st.open + '）' });
    });
    on('#wa-mend-close', () => {
      if (!WA.mend) return mendOut({ ok: false, reason: 'module-missing' });
      // 这一处是**唯一**把 applyRelation 置真的地方 —— 结案改关系必须显式授权（不是默认）。
      const r = WA.mend.close(wv('#wa-mend-person'), mendId(), 'fulfilled', { applyRelation: true });
      mendOut(r.ok ? Object.assign({}, r, { id: '已结案 ' + r.status + ' · 进度 ' + r.progress
        + ' · 关系 ' + (r.relation ? (r.relation.ok ? '已生效' : '未生效：' + r.relation.reason) : '未触发') }) : r);
    });
    on('#wa-mend-fail', () => {
      if (!WA.mend) return mendOut({ ok: false, reason: 'module-missing' });
      // 失败是**一等公民**：照实留痕，不删行。
      const r = WA.mend.close(wv('#wa-mend-person'), mendId(), 'failed', { reason: '修复失败' });
      mendOut(r.ok ? Object.assign({}, r, { id: '已判失败（留痕，不删行）' }) : r);
    });
    const ecoOut = function (t) { const el = $('#wa-eco-out'); if (el) el.innerHTML = '<div class="wa-dim">' + String(t) + '</div>'; };
    { const el = $('#wa-eco-enabled');
      if (el) el.onchange = function () { WA.economy.setSettings({ enabled: el.checked }); ecoOut(el.checked ? '供需循环已开启' : '已关闭（关闭时不入库、不定价、不成交、不推时段）'); }; }
    const ecoQty = function () { const v = parseFloat($('#wa-eco-qty').value); return isFinite(v) ? v : NaN; };
    { const el = $('#wa-eco-stock');
      if (el) el.onclick = function () {
        // 首次登记必须给基础价；留空就不传 base，由引擎报 missing-base（面板不替用户填一个默认价）。
        const b = parseFloat($('#wa-eco-base').value);
        const o = isFinite(b) ? { base: b } : {};
        const r = WA.economy.stock($('#wa-eco-place').value, $('#wa-eco-res').value, ecoQty(), o);
        ecoOut(r.ok ? '入库：' + r.resource + ' 存 ' + r.stock + '（基础价 ' + r.base + '）' : '入库失败：' + r.reason);
      }; }
    { const el = $('#wa-eco-price');
      if (el) el.onclick = function () {
        const v = parseFloat($('#wa-eco-price-in').value);
        const r = WA.economy.price($('#wa-eco-place').value, $('#wa-eco-res').value, isFinite(v) ? v : NaN);
        ecoOut(r.ok ? '定价 ' + r.price + '（许可带 ' + r.lo + '-' + r.hi + '）'
          : '定价失败：' + r.reason + (r.lo !== undefined ? '（许可带 ' + r.lo + '-' + r.hi + '）' : ''));
      }; }
    { const el = $('#wa-eco-buy');
      if (el) el.onclick = function () {
        // 面板不替买主垫钱、也不替卖家赊账：钱不够/货不够都原样报出。
        const r = WA.economy.buy($('#wa-eco-place').value, $('#wa-eco-res').value, ecoQty(), { by: $('#wa-eco-buyer').value });
        ecoOut(r.ok ? '成交 ' + r.qty + '件，付 ' + r.total + '，余额 ' + r.balance + '，余货 ' + r.stock
          : '未成交：' + r.reason + (r.want !== undefined ? '（要 ' + r.want + '，有 ' + r.have + '）' : ''));
      }; }
    { const el = $('#wa-eco-craft');
      if (el) el.onclick = function () {
        const t = parseInt($('#wa-eco-times').value, 10);
        const r = WA.economy.craft($('#wa-eco-place').value, $('#wa-eco-recipe').value,
          { by: $('#wa-eco-maker').value, times: isFinite(t) ? t : 1 });
        ecoOut(r.ok ? '产出 ' + JSON.stringify(r.made) : '未能生产：' + r.reason + (r.short ? '（还缺 ' + JSON.stringify(r.short) + '）' : ''));
      }; }
    { const el = $('#wa-eco-tick');
      if (el) el.onclick = function () {
        // 同一时段只能推一次：重复推演不得造成第二次消耗（拒收理由照实显示）。
        const r = WA.economy.tick($('#wa-eco-stamp').value);
        ecoOut(r.ok ? '时段 ' + r.stamp + '：' + (r.rows.map(function (x) { return x.resource + ' 消耗 ' + x.consumed + '，价 ' + x.price + '→' + x.next; }).join('；') || '无货可推')
          : '未推进：' + r.reason);
      }; }
    { const el = $('#wa-eco-view');
      if (el) el.onclick = function () {
        const r = WA.economy.view($('#wa-eco-place').value, $('#wa-eco-res').value);
        ecoOut(r.ok ? r.resource + '：存 ' + r.stock + '，现价 ' + r.price + '，基础 ' + r.base + '，许可带 ' + r.lo + '-' + r.hi : '无此货：' + r.reason);
      }; }
    { const el = $('#wa-eco-shelf');
      if (el) el.onclick = function () {
        const r = WA.economy.shelf($('#wa-eco-place').value);
        ecoOut(r.ok ? r.place + '：' + r.goods.map(function (g) { return g.resource + '×' + g.stock + '@' + g.price; }).join('、') : '货架为空：' + r.reason);
      }; }
    { const el = $('#wa-eco-route-add');
      if (el) el.onclick = function () {
        const c = parseFloat($('#wa-eco-cost').value);
        const r = WA.economy.route($('#wa-eco-route').value,
          { lane: $('#wa-eco-lane').value, from: $('#wa-eco-from').value, to: $('#wa-eco-to').value, cost: isFinite(c) ? c : NaN });
        ecoOut(r.ok ? '商路 ' + r.id + '（' + r.lane + '）：' + r.status + '，运费 ' + r.cost : '未能登记：' + r.reason);
      }; }
    { const el = $('#wa-eco-route-block');
      if (el) el.onclick = function () {
        // 阻断是状态标记，不删行：世界仍记得有这条路，可解除后续运。
        const r = WA.economy.markRoute($('#wa-eco-route').value, false, { reason: '路断' });
        ecoOut(r.ok ? '已阻断：' + r.id + '（' + r.reason + '）' : '未阻断：' + r.reason);
      }; }
    { const el = $('#wa-eco-route-open');
      if (el) el.onclick = function () {
        const r = WA.economy.markRoute($('#wa-eco-route').value, true);
        ecoOut(r.ok ? '已解除：' + r.id : '未解除：' + r.reason);
      }; }
    { const el = $('#wa-eco-ship');
      if (el) el.onclick = function () {
        // 路受阻则货不动（不消耗）；解除后可续运。
        const r = WA.economy.ship($('#wa-eco-route').value, $('#wa-eco-place').value, $('#wa-eco-res').value, ecoQty());
        ecoOut(r.ok ? '经 ' + r.id + ' 到货 ' + r.qty + '（余 ' + r.stock + '，运费 ' + r.cost + '）'
          : '未运送：' + r.reason + (r.why ? '（' + r.why + '）' : ''));
      }; }
    { const el = $('#wa-eco-routes');
      if (el) el.onclick = function () {
        const s = WA.economy.statView();
        ecoOut('商路 ' + s.routes + ' 条（受阻 ' + s.stuck + '）；货 ' + s.goods + ' 项，订单 ' + s.orders + ' 笔');
      }; }
    const instOut = function (t) { const el = $('#wa-inst-out'); if (el) el.innerHTML = '<div class="wa-dim">' + String(t) + '</div>'; };
    const instOrg = function () { return wv('#wa-inst-org'); };
    const instPerms = function () {
      // 面板只把用户写下的字拆开，不替他补默认权限（自造权限由引擎 bad-perms 收）。
      return wv('#wa-inst-perms').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x.length; });
    };
    { const el = $('#wa-inst-enabled');
      if (el) el.onchange = function () { WA.inst.setSettings({ enabled: el.checked }); instOut(el.checked ? '组织制度已开启' : '已关闭（关闭时建档/设职/任免/批准一律拒收）'); }; }
    on('#wa-inst-charter', () => {
      const r = WA.inst.charter(instOrg(), { kind: wv('#wa-inst-kind'), name: wv('#wa-inst-name') });
      instOut(r.ok ? '已建档：' + r.id + '（' + r.kind + '，职位 ' + r.posts + ' 个）' : '未能建档：' + r.reason);
    });
    on('#wa-inst-setpost', () => {
      // 权限必须落在具名表内——面板不替用户改名，原样交给引擎。
      const r = WA.inst.post(instOrg(), wv('#wa-inst-post'), { perms: instPerms() });
      instOut(r.ok ? '已设职：' + r.title + '（' + r.perms.join('/') + '）' : '未能设职：' + r.reason);
    });
    on('#wa-inst-assign', () => {
      // 换人必须用户显式勾选：面板不替他推定「反正是换人」。
      const r = WA.inst.assign(instOrg(), wv('#wa-inst-post'), wv('#wa-inst-person'), { replace: !!($('#wa-inst-replace') || {}).checked });
      instOut(r.ok ? '已任职：' + r.title + '=' + r.holder + (r.replaced ? '（显式换人）' : '') : '未能任职：' + r.reason);
    });
    on('#wa-inst-vacate', () => {
      const r = WA.inst.vacate(instOrg(), wv('#wa-inst-post'), { why: wv('#wa-inst-why') });
      instOut(r.ok ? '已离任：' + r.title + '（原 ' + r.from + '，' + r.why + '）' : '未能离任：' + r.reason);
    });
    on('#wa-inst-succeed', () => {
      // 交接受检：在途与旧承诺留空就不传，由引擎报 missing-handover（面板不替他填 0）。
      const p = parseFloat($('#wa-inst-projects').value), o = parseFloat($('#wa-inst-oaths').value);
      const opt = {};
      if (isFinite(p)) opt.openProjects = p;
      if (isFinite(o)) opt.oldOaths = o;
      const r = WA.inst.succession(instOrg(), wv('#wa-inst-from'), wv('#wa-inst-to'), opt);
      instOut(r.ok ? '已交接：' + r.from + '→' + r.to + '（在途 ' + r.openProjects + '，旧承诺 ' + r.oldOaths + '，不自动作废）'
        : '未能交接：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    on('#wa-inst-propose', () => {
      const r = WA.inst.propose(instOrg(), wv('#wa-inst-dec'), { by: wv('#wa-inst-person'), needs: wv('#wa-inst-needs') || 'approve' });
      instOut(r.ok ? '已挂待批：' + r.id + '（需 ' + r.needs + '，持有者 ' + (r.holders || []).join('、') + '）'
        : '未挂起：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    on('#wa-inst-approve', () => {
      // 批准者本人必须持有 approve：面板只转发「谁批的」，不替他选人。
      // X5（v2.128.0）：走**专用批准口** `inst.approve` —— 它体内就是那一次
      //   `decide(...,'approved',...)`（同一件事只有一个实现），差别只在返回体多带
      //   `required`/`holders`。此前此处直调 `decide`，于是 `approve` 全仓零读者：
      //   批准口没人用 = 那一层「凭什么能批」永远答不出来。
      const r = WA.inst.approve(instOrg(), wv('#wa-inst-dec2'), { by: wv('#wa-inst-by') });
      instOut(r.ok ? '已批准：' + r.id + '（由 ' + r.decider + '）'
        : '未能批准：' + r.reason + (r.holders && r.holders.length ? '（持批准权者 ' + r.holders.join('、') + '）' : ''));
    });
    on('#wa-inst-reject', () => {
      const r = WA.inst.decide(instOrg(), wv('#wa-inst-dec2'), 'rejected', { by: wv('#wa-inst-by') });
      instOut(r.ok ? '已否决：' + r.id + '（由 ' + r.decider + '）' : '未能否决：' + r.reason);
    });
    on('#wa-inst-mark-breach', () => {
      // 罚则必填：本模块不自行判罚，面板也不替他编一条。
      const r = WA.inst.breach(instOrg(), wv('#wa-inst-person'), wv('#wa-inst-breach'), { penalty: wv('#wa-inst-penalty') });
      instOut(r.ok ? '已记违约：' + r.id + '（罚则 ' + r.penalty + '）' : '未能记录：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    on('#wa-inst-settle', () => {
      const r = WA.inst.settle(instOrg(), wv('#wa-inst-br2'), { evidence: wv('#wa-inst-evidence') });
      instOut(r.ok ? '违约已结：' + r.id + '（依据已留痕）' : '未能结案：' + r.reason);
    });
    on('#wa-inst-view', () => {
      const r = WA.inst.view(instOrg());
      if (!r.ok) return instOut('无此组织：' + r.reason);
      // X5（v2.128.0）：`view().canApprove` 只报 approve 一档，答不出「这个人能拍什么板」。
      //   `authority` 正面答那一问（含「不在任 ⇒ 空集」，而不是让人从「查不到」反推）。
      //   取批准人输入框里的人来问 —— 用户点「看组织」时想知道的往往正是这个人。
      const whoA = wv('#wa-inst-by');
      const auth = (whoA && WA.inst && typeof WA.inst.authority === 'function')
        ? (function () { try { return WA.inst.authority(instOrg(), whoA); } catch (e) { return null; } })() : null;
      const authLine = (auth && auth.ok)
        ? ('｜' + auth.who + '：' + (auth.inOffice ? ('在职 ' + auth.posts.join('/') + '，权限 ' + (auth.perms.join('/') || '无') + (auth.canApprove ? '（可拍板）' : '（不可拍板）')) : '不在任（能拍板的范围是空集）'))
        : '';
      instOut(r.name + '（' + r.kind + '）：' + (r.posts.length ? r.posts.map(function (p) { return p.title + '=' + (p.holder || '空缺') + '[' + p.perms.join('/') + ']'; }).join('，') : '无职位')
        + '；待批 ' + r.open + '，未结违约 ' + r.breaches + '，交接 ' + r.successions + ' 次；可批准者 ' + (r.canApprove.join('、') || '无')
        + authLine);
    });
    on('#wa-inst-out-btn', () => {
      const s = WA.inst.statView();
      instOut('组织 ' + s.orgs + ' 个，职位 ' + s.posts + '，待批 ' + s.pending + '，未结违约 ' + s.openBreaches);
    });
    const probeOut = function (t) { const el = $('#wa-probe-out'); if (el) el.innerHTML = '<div class="wa-dim">' + String(t) + '</div>'; };
    const probeCase = function () { return wv('#wa-probe-case'); };
    { const el = $('#wa-probe-enabled');
      if (el) el.onchange = function () { WA.probe.setSettings({ enabled: el.checked }); probeOut(el.checked ? '调查卷宗已开启' : '已关闭（关闭时不立案、不举证、不对质、不定案）'); }; }
    on('#wa-probe-open', () => {
      // 至少两条假说：面板按分号拆开原样交给引擎，不替他补第二条。
      const hyps = wv('#wa-probe-hyps').split(';').map(function (x) { return x.trim(); }).filter(function (x) { return x.length; });
      const r = WA.probe.open(wv('#wa-probe-q'), hyps);
      probeOut(r.ok ? '已立案：' + r.id + '（' + r.hypotheses + ' 条假说）' : '未能立案：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    const probeEv = (dir) => {
      // 支持与反驳走同一入口、只差方向：面板不把两者合成一个数。
      const r = WA.probe.addEvidence(probeCase(), wv('#wa-probe-claim'),
        { level: wv('#wa-probe-level'), dir: dir, about: wv('#wa-probe-about'), by: wv('#wa-probe-by') });
      probeOut(r.ok ? '已记' + (dir === 'support' ? '支持' : '反驳') + '：' + r.hypothesis + '（支持 ' + r.support + '／反驳 ' + r.refute + '）'
        : '未能记录：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    };
    on('#wa-probe-support', () => probeEv('support'));
    on('#wa-probe-refute', () => probeEv('refute'));
    on('#wa-probe-confront', () => {
      // 对质要有本钱：支持不足时引擎报 insufficient-support，面板原样显示。
      const r = WA.probe.confront(probeCase(), wv('#wa-probe-who'), { about: wv('#wa-probe-about'), level: wv('#wa-probe-level'), by: wv('#wa-probe-by') });
      probeOut(r.ok ? '已对质：' + r.who + '（凭 ' + r.support + ' 条支持；认知' + (r.belief && r.belief.ok ? '已改变' : '未改变：' + ((r.belief || {}).reason || '')) + '）'
        : '未能对质：' + r.reason + (r.need !== undefined ? '（有 ' + r.support + '，需 ' + r.need + '）' : ''));
    });
    on('#wa-probe-decide', () => {
      const r = WA.probe.decide(probeCase(), { note: wv('#wa-probe-why') });
      if (!r.ok) return probeOut('未能定案：' + r.reason);
      probeOut(r.verdict === 'guilty' ? '已定案：' + r.leader + '（支持 ' + r.support + '，无反驳）'
        : '定为未决（证据不足是一等结论）：最强 ' + r.leader + ' 支持 ' + r.support + '／反驳 ' + r.refute);
    });
    on('#wa-probe-wrong', () => {
      const r = WA.probe.wrong(probeCase(), wv('#wa-probe-who'), { why: wv('#wa-probe-why') });
      probeOut(r.ok ? '已记误指：' + r.who + '（卷宗留下「查错人」这件事）' : '未能记录：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    on('#wa-probe-view', () => {
      const r = WA.probe.view(probeCase());
      if (!r.ok) return probeOut('无此案：' + r.reason);
      // X4：`auditRecord` 的真读者**就在这** —— 用户输入的案件 id 是真输入，
      //   读数落在既有输出节点上。只有 `typeof === 'function'` 的能力申报不算「有人看」。
      const au = (function () { try { return WA.probe.auditRecord(probeCase()); } catch (e) { return null; } })();
      probeOut(r.question + '（' + r.status + (r.verdict ? '／' + r.verdict : '') + '）：'
        + r.hypotheses.map(function (h) { return h.text + '[支持' + h.support + '/反驳' + h.refute + ']'; }).join('，')
        + '；' + (r.decidable ? '可定案' : '不可定案（' + (r.blockedBy === 'refuted' ? '有反证未解' : '证据不足') + '）')
        + (au && au.ok ? ('；审计 线索' + au.evidence + '／对质' + au.confronts + '／误指' + au.wrongs) : '；审计 读不出'));
    });
    on('#wa-probe-out-btn', () => {
      const s = WA.probe.statView();
      probeOut('案件 ' + s.cases + '（在查 ' + s.open + '）；线索 ' + s.evidence + '，误指 ' + s.wrongs
        + '；定案 ' + s.byVerdict.guilty + '，未决 ' + s.byVerdict.undecided + '，误指结案 ' + s.byVerdict.clear);
    });
    const rgOut = function (t) { const el = $('#wa-rg-out'); if (el) el.innerHTML = '<div class="wa-dim">' + String(t) + '</div>'; };
    const rgPlace = function () { return wv('#wa-rg-place'); };
    { const el = $('#wa-rg-enabled');
      if (el) el.onchange = function () { WA.region.setSettings({ enabled: el.checked }); rgOut(el.checked ? '远方传播已开启' : '已关闭（关闭时不登记远方、不记事件、不落地）'); }; }
    on('#wa-rg-register', () => {
      // 距离与渠道都是必需的：留空就不传，由引擎报 missing-distance（面板不替他填一个默认距离）。
      const d = parseFloat($('#wa-rg-days').value);
      const o = {};
      if (isFinite(d)) o.distanceDays = d;
      const l = wv('#wa-rg-lane'); if (l) o.lane = l;
      const r = WA.region.register(rgPlace(), o);
      rgOut(r.ok ? '已登记：' + r.name + '（距本地 ' + r.distanceDays + ' 天，走 ' + r.lane + '）' : '未能登记：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    on('#wa-rg-occur', () => {
      const r = WA.region.occur(rgPlace(), wv('#wa-rg-kind'), { text: wv('#wa-rg-text') });
      rgOut(r.ok ? '已记：' + r.place + ' ' + r.kind + '（消息 ' + Math.round(r.delayMs / 3600000) + ' 小时后到）' : '未能记录：' + r.reason);
    });
    on('#wa-rg-deliver', () => {
      // 未到期一律拒收：面板把「还需多久」原样报出来，不替他抢跑。
      const r = WA.region.deliver(wv('#wa-rg-eid'));
      rgOut(r.ok ? '已落地：' + r.place + ' ' + r.kind : '未落地：' + r.reason
        + (r.waitMs !== undefined ? '（还需 ' + Math.round(r.waitMs / 3600000) + ' 小时）' : '')
        + (r.why ? '（' + r.why + '）' : ''));
    });
    on('#wa-rg-block', () => {
      const r = WA.region.markLane(rgPlace(), true, { why: wv('#wa-rg-why') || '路断' });
      rgOut(r.ok ? '已阻断：' + r.name + '（' + r.why + '）——消息原地等，不消失' : '未能阻断：' + r.reason);
    });
    on('#wa-rg-open', () => {
      const r = WA.region.markLane(rgPlace(), false);
      rgOut(r.ok ? '已解除：' + r.name + '——积压的消息可以上路了' : '未能解除：' + r.reason);
    });
    on('#wa-rg-heard', () => {
      const r = WA.region.heard(wv('#wa-rg-who'));
      if (!r.ok) return rgOut('未能查：' + r.reason);
      rgOut(r.person + ' 听说了 ' + r.heard + ' 件：' + (r.rows.map(function (x) { return x.place + '的' + x.kind + (x.fresh ? '' : '（旧闻）'); }).join('、') || '无'));
    });
    on('#wa-rg-fine', () => {
      // 近处精细、远处粗粒度：面板如实报「这一屏是什么粒度」，不把粗粒度装成明细。
      const r = WA.region.fine(rgPlace());
      if (!r.ok) return rgOut('未能查：' + r.reason);
      rgOut(r.place + '（' + (r.grain === 'fine' ? '本地精细' : '远方粗粒度') + '）：'
        + r.rows.map(function (x) { return x.kind + (x.text ? '——' + x.text : ''); }).join('；'));
    });
    on('#wa-rg-view', () => {
      const s = WA.region.statView();
      rgOut('远方 ' + s.places + ' 处，事件 ' + s.events + '（待落地 ' + s.pending + '，已落地 ' + s.delivered + '），受阻 ' + s.blocked + ' 处');
    });
    on('#wa-rg-out-btn', () => {
      const s = WA.region.statView();
      rgOut('远方 ' + s.places + ' 处：' + WA.region.places().map(function (p) { return p.name + '(' + p.distanceDays + '天/' + p.lane + (p.blocked ? '/受阻' : '') + ')'; }).join('，'));
    });
    const stOut = function (t) { const el = $('#wa-st-out'); if (el) el.innerHTML = '<div class="wa-dim">' + String(t) + '</div>'; };
    const stList = function (sel) { return wv(sel).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x.length; }); };
    { const el = $('#wa-st-enabled');
      if (el) el.onchange = function () { WA.stage.setSettings({ enabled: el.checked }); stOut(el.checked ? '玩法进度已开启' : '已关闭（关闭时不采纳、不记分、不迁移）'); }; }
    on('#wa-st-adopt', () => {
      // 换包必须用户显式勾选：面板不替他推定「反正是换包」。
      const r = WA.stage.adopt(wv('#wa-st-pack'), { replace: !!($('#wa-st-replace') || {}).checked });
      stOut(r.ok ? '已采纳：' + r.pack + '（阶段 ' + r.stage + '；指标 ' + r.metrics.join('/') + '）' : '未能采纳：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    on('#wa-st-mark', () => {
      const d = parseFloat($('#wa-st-delta').value);
      const r = WA.stage.mark(wv('#wa-st-metric'), isFinite(d) ? d : NaN);
      stOut(r.ok ? '已记：' + r.metric + ' ' + r.before + '→' + r.value : '未能记录：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    on('#wa-st-plan', () => {
      // 条件与清单缺一不可：留空就不传，由引擎报 missing-trigger / missing-changes。
      const n = parseFloat($('#wa-st-need').value);
      const o = { to: wv('#wa-st-to'), changes: stList('#wa-st-changes') };
      const m = wv('#wa-st-metric'); if (m) o.metric = m;
      if (isFinite(n)) o.need = n;
      const r = WA.stage.plan(o);
      stOut(r.ok ? '已声明：' + r.from + '→' + r.to + '（需 ' + r.metric + '≥' + r.need + '；要变 ' + r.changes.join('、') + '）'
        : '未能声明：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    on('#wa-st-transit', () => {
      // 门槛未达与清单未落实都原样报出：面板不替他跳过任何一项。
      const r = WA.stage.transit(wv('#wa-st-tid'), { applied: stList('#wa-st-applied') });
      stOut(r.ok ? '已换阶段：' + r.from + '→' + r.to : '未能换阶段：' + r.reason
        + (r.have !== undefined ? '（有 ' + r.have + '，需 ' + r.need + '）' : '')
        + (r.missing ? '（还缺 ' + r.missing.join('、') + '）' : ''));
    });
    on('#wa-st-view', () => {
      const r = WA.stage.view();
      if (!r.ok) return stOut('未采纳玩法包：' + r.reason);
      stOut(r.pack + '（' + r.stage + '）：' + r.metrics.map(function (m) { return m.metric + '=' + m.value; }).join('，')
        + '；待推进 ' + r.pending.map(function (t) { return t.to + '(' + t.have + '/' + t.need + (t.ready ? '·可推进' : '') + ')'; }).join('，')
        + (r.done.length ? '；已走 ' + r.done.map(function (t) { return t.from + '→' + t.to; }).join('，') : ''));
    });
    on('#wa-st-out-btn', () => {
      const s = WA.stage.statView();
      stOut(s.pack ? ('当前 ' + s.pack + '·' + s.stage + '；待推进 ' + s.pending + '，已走 ' + s.done + '，指标 ' + s.metrics + ' 项')
        : '尚未采纳玩法包（可选项：' + WA.stage.PACKS.join('/') + '）');
    });
    const seOut = function (t) { const el = $('#wa-se-out'); if (el) el.innerHTML = '<div class="wa-dim">' + String(t) + '</div>'; };
    const seList = function (sel) { return wv(sel).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x.length; }); };
    { const el = $('#wa-se-enabled');
      if (el) el.onchange = function () { WA.session.setSettings({ enabled: el.checked }); seOut(el.checked ? '多人场已开启' : '已关闭（关闭时不入座、不验票、不发言）'); }; }
    on('#wa-se-host', () => {
      // 凭证由用户自己提供：面板不生成、不回显、不落盘（只在本次操作里用）。
      const r = WA.session.host(wv('#wa-se-name'), { role: wv('#wa-se-role'), token: wv('#wa-se-token') });
      seOut(r.ok ? '已开主持座：' + r.name + '（' + r.role + '，权限 ' + r.perms.join('/') + '，版本 ' + r.rev + '）' : '未能开座：' + r.reason + (r.hint ? '（' + r.hint + '）' : ''));
    });
    on('#wa-se-join', () => {
      const r = WA.session.join(wv('#wa-se-name'), { role: wv('#wa-se-role'), token: wv('#wa-se-token'),
        perms: seList('#wa-se-perms'), takeover: !!($('#wa-se-takeover') || {}).checked });
      seOut(r.ok ? '已入座：' + r.name + '（' + r.role + '，权限 ' + (r.perms.join('/') || '无') + '）' : '未能入座：' + r.reason);
    });
    on('#wa-se-auth', () => {
      const r = WA.session.auth(wv('#wa-se-name'), wv('#wa-se-token'));
      if (!r.ok) return seOut('验票失败：' + r.reason);
      // X6（v2.128.0）：验票通过只答「票是对的」，答不出「这个人是谁、授权到哪」。
      //   `identify` 才是身份那一问（它凭票认人并把结果落到写闸门）——两问必须分开报，
      //   否则「验过了」会被读成「授权到位了」。
      const idn = (WA.session && typeof WA.session.identify === 'function')
        ? (function () { try { return WA.session.identify(wv('#wa-se-token')); } catch (e) { return { ok: false, reason: 'threw' }; } })()
        : null;
      let tail = '';
      if (idn && idn.ok) {
        tail = '｜身份 ' + idn.identity + (idn.known ? '（座 ' + idn.role + '）' : '')
          + '；授权位 ' + ((idn.perms || []).join('/') || '无')
          + (idn.knownToPerms ? '；已在权限表' : '；**不在权限表**')
          + (idn.gated ? '；写闸门按位拦' : '；写闸门此刻仍放行');
      } else if (idn) tail = '｜身份未能确定：' + idn.reason;
      seOut('验票通过：' + r.name + '（' + r.role + '）' + tail);
    });
    on('#wa-se-post', () => {
      // 顺序号留空就不传：由引擎取下一个（面板不替他算，算了就会掩盖跳号）。
      const n = parseFloat($('#wa-se-seq').value);
      const o = {};
      if (isFinite(n)) o.seq = n;
      const r = WA.session.post(wv('#wa-se-name'), wv('#wa-se-token'), wv('#wa-se-body'), o);
      seOut(r.ok ? '已发言：第 ' + r.seq + ' 条' : '未能发言：' + r.reason
        + (r.expect !== undefined ? '（应为第 ' + r.expect + ' 条）' : ''));
    });
    on('#wa-se-since', () => {
      const n = parseFloat($('#wa-se-last').value);
      const r = WA.session.since(wv('#wa-se-name'), wv('#wa-se-token'), isFinite(n) ? n : NaN);
      seOut(r.ok ? '续传 ' + r.count + ' 条（到第 ' + r.head + ' 条）'
        : '未能续传：' + r.reason + (r.oldest !== undefined ? '（窗口最早第 ' + r.oldest + ' 条，须重同步）' : ''));
    });
    on('#wa-se-resync', () => {
      const r = WA.session.resync(wv('#wa-se-name'), wv('#wa-se-token'));
      seOut(r.ok ? '已重同步：水位第 ' + r.watermark + ' 条，版本 ' + r.snapshot.rev + '，含 ' + r.snapshot.rows.length + ' 条与 ' + r.snapshot.seats.length + ' 座'
        : '未能重同步：' + r.reason);
    });
    on('#wa-se-leave', () => {
      const r = WA.session.leave(wv('#wa-se-name'), wv('#wa-se-token'));
      seOut(r.ok ? '已卸座：' + r.name + '（历史保留 ' + r.kept + ' 条，不撤回）' : '未能卸座：' + r.reason);
    });
    on('#wa-se-view', () => {
      const r = WA.session.view(wv('#wa-se-name'), wv('#wa-se-token'));
      if (!r.ok) return seOut('未能看视点：' + r.reason);
      // v2.119.0（优化③·真缺陷修复）：`view(name, token)` 有**两个分支**——
      //   ① 有 name：本人视点，返回 { name, role, scope, rows }；
      //   ② name 为空：**作者面总览**，返回 { host, seq, seats, log }——**没有 rows**。
      //   原先这里无条件 `r.rows.map(...)` ⇒ 名字栏留空点按钮就崩
      //   （`Cannot read properties of undefined (reading 'map')`，实测）。
      //   判「有没有 rows」而不是判「name 空不空」：语义锚点在后者的**返回值形状**上，
      //   这样即便将来总览也带上 rows，本分支仍然自洽。
      if (!Array.isArray(r.rows)) {
        return seOut('作者面总览：主持 ' + (r.host || '尚未开座') + '；在场 ' + r.seats.length
          + ' 座，已到第 ' + r.seq + ' 条（历史 ' + r.log + ' 条）——填名字与令牌可看本人视点');
      }
      seOut(r.name + '（' + r.role + '，' + (r.scope === 'all' ? '全量' : '仅自己') + '）：'
        + (r.rows.map(function (x) { return '#' + x.seq + ' ' + x.by + '：' + x.text; }).join('；') || '无'));
    });
    on('#wa-se-out-btn', () => {
      const s = WA.session.statView();
      const base = s.host ? ('主持 ' + s.host + '；在场 ' + s.active + '/' + s.seats + '，已到第 ' + s.seq + ' 条') : '尚未开座';
      // X6（v2.128.0）：identity 是**纯只读**的身份现状口（不动闸门），故挂在只读按钮上。
      //   与 statView 分工：那一格答「几个座、到第几条」，这一格答「此刻谁在场、授权到哪」。
      const idn = (WA.session && typeof WA.session.identity === 'function')
        ? (function () { try { return WA.session.identity(); } catch (e) { return null; } })() : null;
      let tail = '';
      if (idn && idn.ok) {
        tail = '｜在场 ' + (idn.seats.map(function (x) { return x.name + '(' + x.role + ':' + (x.perms.join('/') || '无') + ')'; }).join('、') || '（空场）')
          + (idn.gate ? '；写闸门 ' + (idn.gate.active ? ('当前使用者 ' + idn.gate.user + '，拒 ' + idn.gate.denied + '／未启用 ' + idn.gate.off) : '未启用（无人登记 ⇒ 一律放行）') : '');
      }
      seOut(base + tail);
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
    // v2.99.0：原著幕目的面板绑定。
    //   四类拒绝理由都必须看得见——它们在世界状态里都长得像「什么都没发生」：
    //     · empty-text / too-long（贴错内容 / 超上限——超上限一律拒收，不静默截断）；
    //     · bad-coord / out-of-range（坐标写错 / 越界——**不夹到边界**，幕号是标出来的）；
    //     · no-outline（还没采纳就定位 ⇒ 照实说没有基准，不编一份出来）；
    //     · build-throw / adopt-throw / clear-throw（引擎内部异常，另记在 stat.faults）。
    //   试算产物留在**闭包变量**而不落 dataset：它体积随篇幅线性增长，
    //   往 dataset 里塞等于把整份大纲复制到 DOM 属性上（renderBody 重建 DOM，属性也跟着丢）。
    const canonOut = function (r) { return plainOut('wa-cn-out', 'canonOut', r); };
    if (panelEl.dataset.canonOut) { const o = $('#wa-cn-out'); if (o) o.textContent = panelEl.dataset.canonOut; }
    { const el = $('#wa-cn-enabled');
      if (el) el.onchange = function () {
        if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
        WA.canon.setSettings({ enabled: !!el.checked });
        canonOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    on('#wa-cn-build', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      // perAct 以**试算参数**递进去，不写设置面——与题材区的「预览不落设置，应用是唯一写入口」
      //   同一取舍：调一个数字看看效果，不该顺手改掉用户存档里的配置。
      const raw = $('#wa-cn-text') ? ($('#wa-cn-text').value || '') : '';
      const pa = Number(($('#wa-cn-peract') || {}).value);
      const r = WA.canon.buildOutline(raw, isFinite(pa) && pa >= 1 ? { perAct: pa } : null);
      if (!r.ok) { __cnBuilt = null; return canonOut(r); }
      __cnBuilt = r;
      canonOut({ ok: true, id: '已切分 ' + r.acts.length + ' 幕 / ' + r.points + ' 点 / ' + r.segs + ' 段'
        + (r.truncated.acts ? ' · 幕数已截断（共 ' + r.truncated.totalActs + ' 幕）' : '')
        + (r.truncated.points ? ' · 点数已截断（共 ' + r.truncated.totalPoints + ' 点）' : '')
        + ' —— 尚未采纳（点「采纳大纲」才落盘）' });
    });
    on('#wa-cn-adopt', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      if (!__cnBuilt) return canonOut({ ok: false, reason: 'bad-outline' });
      const r = WA.canon.adopt(__cnBuilt, $('#wa-cn-src') ? $('#wa-cn-src').value : '');
      if (!r.ok) return canonOut(r);
      __cnBuilt = null;
      canonOut({ ok: true, id: '已采纳 ' + r.acts + ' 幕 / ' + r.points + ' 点' + (r.replaced ? '（覆盖了上一份）' : '') });
    });
    on('#wa-cn-locate', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      const r = WA.canon.locate($('#wa-cn-coord') ? $('#wa-cn-coord').value : '');
      if (!r.ok) return canonOut(r);
      canonOut({ ok: true, id: r.coord + ' ' + r.title
        + (r.point === null ? '（整幕 ' + r.points + ' 点）' : '（第 ' + r.point + ' 点 / ' + r.chars + ' 字）') });
    });
    on('#wa-cn-view', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      const v = WA.canon.outlineView();
      if (!v.adopted) return canonOut({ ok: true, id: '未采纳任何大纲（还没喂原著）' });
      const b = WA.canon.actsBrief(6);
      canonOut({ ok: true, id: v.acts + '/' + v.acts0 + ' 幕 · ' + v.points + ' 点 · ' + v.chars + ' 字 · '
        + v.segs + ' 段 · 每幕 ' + v.perAct + ' 节'
        + (v.truncated.acts || v.truncated.points ? ' · 有截断（幕' + (v.truncated.acts ? '是' : '否') + '/点' + (v.truncated.points ? '是' : '否') + '）' : '')
        + (v.note ? ' · ' + v.note : '')
        + (b.ok && b.rows.length ? '：' + b.rows.map(function (a) { return 'A' + a.no + ' ' + a.title; }).join('；') : '') });
    });
    on('#wa-cn-clear', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      const r = WA.canon.clearOutline();
      canonOut(r.ok ? { ok: true, id: '已清空原著大纲' } : r);
    });
    // 两个「按号」入口：它们存在的意义是让 coordOf / actText 有真消费方。
    //   · 坐标**只由 coordOf 一处拼**（面板不自己拼 'A'+a）：手拼会绕开边界判定，
    //     A0 / A999 会被拼出来再撞进 locate，于是「号不对」与「号越界」两句不同的话
    //     在界面上塌成同一句。coordOf 对越界号返回 null ⇒ 这里照实报 `bad-coord`。
    //   · actText 是作者面（列点题名）：与 actsBrief 分列——后者只出幕号题名（防剧透），
    //     前者是「我要看这一幕里有哪些点」时才显式要的那一层。
    on('#wa-cn-go', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      const an = Number(($('#wa-cn-actno') || {}).value);
      const pn = wv('#wa-cn-ptno');
      const c = WA.canon.coordOf(an, pn === '' ? null : Number(pn));
      if (!c) return canonOut({ ok: false, reason: 'bad-coord', got: String(an) + (pn === '' ? '' : '.' + pn) });
      const r = WA.canon.locate(c.text);
      if (!r.ok) return canonOut(r);
      canonOut({ ok: true, id: r.coord + ' ' + r.title
        + (r.point === null ? '（整幕 ' + r.points + ' 点）' : '（第 ' + r.point + ' 点 / ' + r.chars + ' 字）') });
    });
    on('#wa-cn-act', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      const an = Number(($('#wa-cn-actno') || {}).value);
      const r = WA.canon.actText(an);
      if (!r.ok) return canonOut(r);
      canonOut({ ok: true, id: r.coord + ' ' + r.title + '（' + r.rows.length + ' 点）：'
        + r.rows.map(function (p) { return p.coord + ' ' + p.title; }).join('；') });
    });
    // v2.100.0（第五十七面）：原著对位的面板绑定。
    //   三枚按钮各接一个导出（无消费方不挂），且**三个出口不合并到一个输出框**：
    //     · 对位试算（signal）——论：「这段文本最像哪一幕，凭哪几个片段」；
    //     · 用世界侧历史对位（position）——论：「按世界已经发生的事，现在到哪一幕了」；
    //     · 看推进度（gap）——论：「还剩多少幕」。
    //   前两个都是「最接近哪一幕」，但**输入面完全不同**（一段手贴的文本 vs 全库历史），
    //   合并成一个按钮就等于逼用户在一句话里回答两个不同的问题。
    //   幕号复用 `wa-cn-actno`（同一个「第几幕」语义不另造一份输入框，与 world 页 transit
    //   复用 mv-from/mv-to 同一取舍）。
    on('#wa-cn-signal', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      const r = WA.canon.signal($('#wa-cn-check') ? ($('#wa-cn-check').value || '') : '');
      if (!r.ok) return canonOut(r);
      const b = r.best;
      return canonOut({ ok: true, id: '最像 ' + b.coord + '「' + b.title + '」（覆盖 ' + Math.round(b.score * 100)
        + '% · ' + b.hit + '/' + b.need + ' 片段）' + (b.evidence.length ? ' · 共有片段：' + b.evidence.join('、') : '')
        + (r.rows.length > 1 ? ' · 另有 ' + (r.rows.length - 1) + ' 幕也有重叠' : '')
        + '（题名级对位，仅供参考——偏没偏由你定）' });
    });
    on('#wa-cn-position', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      const r = WA.canon.position({});
      if (!r.ok) return canonOut(r);
      const srcs = Object.keys(r.sources).map(function (k) { return k + ' ' + r.sources[k]; }).join('/');
      return canonOut({ ok: true, id: '世界侧最接近 ' + r.best.coord + '「' + r.best.title + '」（' + r.best.votes
        + ' 行指向它 · 峰值 ' + Math.round(r.best.score * 100) + '% · ' + r.hitRows + '/' + r.rows + ' 行有重叠 · 源：' + srcs + '）'
        + ' → 已过 ' + r.passed + ' / ' + r.total + ' 幕，还剩 ' + r.remain + ' 幕。'
        + (r.runners.length ? '次选：' + r.runners.map(function (x) { return x.coord + '(' + x.votes + ')'; }).join('、') + '。' : '')
        + '仅报读数与证据，不判偏离' });
    });
    on('#wa-cn-gap', () => {
      if (!WA.canon) return canonOut({ ok: false, reason: 'module-missing' });
      const an = Number(($('#wa-cn-actno') || {}).value);
      const c = WA.canon.coordOf(an, null);
      if (!c) return canonOut({ ok: false, reason: 'bad-coord', got: String(an) });
      const r = WA.canon.gap(c.text);
      if (!r.ok) return canonOut(r);
      return canonOut({ ok: true, id: r.coord + ' 之后还剩 ' + r.remain + ' 幕（共 ' + r.total + ' 幕'
        + (r.archived < r.total ? '，已整理 ' + r.archived + ' 幕' : '') + '）· 只报数，不判偏离' });
    });
    // v2.139.0（E11）：偏离度与偏离曲线（`deviation` / `deviationTrend` 的真产品消费方）。
    //   两枚各答一个问题、**互不替代**：偏离度答「现在偏了多少」（含两个分量），
    //   偏离曲线答「是不是越走越远」（单点分数看不出趋势）。
    //   口径①在 UI 上的体现：两枚都**只读**——不 markCoord、不写 store、不改大纲。
    on('#wa-cn-deviation', () => {
      if (!WA.canon || !WA.canon.deviation) return canonOut({ ok: false, reason: 'module-missing' });
      const r = WA.canon.deviation({});
      if (!r.ok) return canonOut(r);
      return canonOut({ ok: true, id: '偏离 ' + r.score + '（散 ' + r.spread + ' · 慢 ' + r.lag
        + '；撞上 ' + r.hits.join('/') + '；共 ' + r.rows + ' 行'
        + (r.thin ? '，样本不足' : '')
        + (r.over ? ' 已越过告警线 ' + r.alert : '') + '）· 只报不改' });
    });
    on('#wa-cn-trend', () => {
      if (!WA.canon || !WA.canon.deviationTrend) return canonOut({ ok: false, reason: 'module-missing' });
      const r = WA.canon.deviationTrend(20);
      if (!r.adopted) return canonOut({ ok: false, reason: 'no-outline' });
      return canonOut({ ok: true, id: (r.points.length ? r.points.map(function (p) { return p.score; }).join(' → ') : '暂无（历史行不足）')
        + '（共 ' + r.points.length + ' 点 · 只报不改）' });
    });
    // v2.96.0（X3）：传播与辟谣的面板绑定。
    //   五类拒绝理由都必须看得见——它们在世界状态里都长得像「什么都没发生」：
    //     · unknown-fact（事实没登记，不凭空造一条）/ layer-ascend（不许升格成既成事实）；
    //     · tamper-layer（歪曲不许落进事实层与目击层）/ undeclared-rewrite（没声明就不许改值）；
    //     · hops-full / suppressed-full（满员拒收不挤出——中间跳丢了结论就再也算不出来）。
    //   两条读出口（调查 / 全知视图）与一条可见出口同样登记：观测不得改变被观测对象。
    const rumorOut = function (r) { return plainOut('wa-rm-out', 'rumorOut', r); };
    if (panelEl.dataset.rumorOut) { const o = $('#wa-rm-out'); if (o) o.textContent = panelEl.dataset.rumorOut; }
    // 链 id 必须与输出同源缓存：`renderBody()` 整块重建 DOM，输入框被重建回空值 ⇒
    //   起链后回填的 id 在下一次点击时就丢了（紧接着的转述 / 调查会当场变成 missing-fields）。
    //   输出留得住而 id 留不住，等于把「一事实一链」的便利在最需要它的那一步抹掉。
    if (panelEl.dataset.rumorId && $('#wa-rm-id')) $('#wa-rm-id').value = panelEl.dataset.rumorId;
    { const el = $('#wa-rm-enabled');
      if (el) el.onchange = function () {
        if (!WA.rumor) return rumorOut({ ok: false, reason: 'module-missing' });
        WA.rumor.setSettings({ enabled: !!el.checked });
        rumorOut({ ok: true, id: el.checked ? 'enabled' : 'disabled' });
      }; }
    on('#wa-rm-start', () => {
      if (!WA.rumor) return rumorOut({ ok: false, reason: 'module-missing' });
      const r = WA.rumor.startChain(wv('#wa-rm-fact'), wv('#wa-rm-why'));
      // 起链后把链 id 回填进输入框：一事实一链，id 由 factKey 派生，人手抄一遍必错。
      //   这里**不** renderBody()——startChain 只写世界状态与统计，控件树里没有任何一格随它变；
      //   整块重建只会把刚回填的 id 抹回空值，接着的转述 / 调查就当场变成 missing-fields。
      //   （输出节点由 rumorOut 现写，不依赖重建。）
      if (r.ok) panelEl.dataset.rumorId = r.id;
      if (r.ok && $('#wa-rm-id')) $('#wa-rm-id').value = r.id;
      rumorOut(Object.assign({}, r, { id: r.ok ? (r.id + ':conf-' + r.conf + ':hops-' + r.hops) : r.reason }));
    });
    on('#wa-rm-relay', () => {
      if (!WA.rumor) return rumorOut({ ok: false, reason: 'module-missing' });
      const motive = wv('#wa-rm-motive') || 'honest';
      // 值一律递进去（含如实转述）：如实却递了别的值 = 「未声明的改写」，
      //   由引擎当场拒收并在面板上如实显示——面板不替用户把值抹掉（那样就看不见这条门了）。
      const r = WA.rumor.relay(wv('#wa-rm-id'), { from: wv('#wa-rm-from'), to: wv('#wa-rm-to'),
        motive: motive, value: wv('#wa-rm-value'), layer: wv('#wa-rm-layer') });
      rumorOut(Object.assign({}, r, { id: r.ok ? (r.layer + ':conf-' + r.conf + ':intact-' + (r.intact ? 'y' : 'n') + ':' + r.hops + '跳') : r.reason }));
    });
    on('#wa-rm-refute', () => {
      if (!WA.rumor) return rumorOut({ ok: false, reason: 'module-missing' });
      const r = WA.rumor.refute(wv('#wa-rm-id'), { from: wv('#wa-rm-from'), to: wv('#wa-rm-to'), layer: wv('#wa-rm-layer') });
      rumorOut(Object.assign({}, r, { id: r.ok ? ('辟谣:' + r.layer + ':intact-' + (r.intact ? 'y' : 'n')) : r.reason }));
    });
    on('#wa-rm-conceal', () => {
      if (!WA.rumor) return rumorOut({ ok: false, reason: 'module-missing' });
      const r = WA.rumor.conceal(wv('#wa-rm-id'), { by: wv('#wa-rm-from'), why: wv('#wa-rm-why') });
      rumorOut(Object.assign({}, r, { id: r.ok ? ('隐瞒 ' + r.by + ':共' + r.suppressed + '次') : r.reason }));
    });
    on('#wa-rm-investigate', () => {
      if (!WA.rumor) return rumorOut({ ok: false, reason: 'module-missing' });
      const r = WA.rumor.investigate(wv('#wa-rm-id'));
      // X4（v2.128.0）：裁决面（`probe.resolve`）的显示口 —— 复用既有「调查」按钮，零新增控件。
      //   「问不出来」（ruling=null：probe 缺席 / 未知层 / 值为空）与「问出来是僵局」（undecided）
      //   在这里也必须读得不一样，否则两态又被合成一句好听话。
      const rl = r.ruling;
      const rlTxt = !rl ? '裁决 问不出来（缺裁决面或缺来源等级）'
        : ((rl.verdict === 'both' ? '裁决 互相印证（同向，不构成冲突）'
          : (rl.verdict === 'a' ? '裁决 采信事实侧' : (rl.verdict === 'b' ? '裁决 采信终态侧' : '裁决 未决')))
          + '（' + rl.reason + '；存疑 ' + rl.doubtedCount + '）');
      // 「传到最后还是不是原来那条」——只报事实：被改过就报 drift 的 from→to，没被改就报原样。
      rumorOut(r.ok ? Object.assign({}, r, { id: '层 ' + r.layer + ':' + r.hopCount + '跳:'
        + (r.tampered ? ('已改写 ' + (r.drift ? (r.drift.from + '→' + r.drift.to) : '')) : '未被改写')
        + ':隐瞒 ' + r.suppressed + '；' + rlTxt }) : r);
    });
    on('#wa-rm-fullview', () => {
      if (!WA.rumor) return rumorOut({ ok: false, reason: 'module-missing' });
      const r = WA.rumor.fullView();
      rumorOut(r.ok ? { ok: true, id: (r.chains.length ? r.chains.map(function (c) {
        return c.factKey + '@' + c.layer + (c.intact ? '' : '✗');
      }).join('；') : '暂无传播链') } : r);
    });
    on('#wa-rm-visible', () => {
      if (!WA.rumor) return rumorOut({ ok: false, reason: 'module-missing' });
      const r = WA.rumor.visibleTo(wv('#wa-rm-person'));
      rumorOut(r.ok ? { ok: true, id: (r.count ? (r.count + ' 条：' + r.rows.map(function (x) {
        return x.factKey + '@' + x.layer;
      }).join('；')) : '无（只出事实与亲历两层）') } : r);
    });
    on('#wa-de-abort', () => { WA.directEvent.abort(); renderBody(); });

    // v2.139.0（E9）：势力关系网三个入口的绑定。
    //   四种「没算成」的情形一律**显式报出**（不留空面板）：这四种在空白面板上长得一模一样，
    //   而处置方式完全不同 —— 模块坏了 / 开关没开 / 世界没有势力 / 图真的是空的。
    const fgOut = function (text) { panelEl.dataset.fgOut = text; const o = $('#wa-fg-out'); if (o) o.textContent = text; };
    const fgWhy = function (r) {
      const m = { disabled: '关系网开关未开（设置里打开后才有图）', 'module-missing': '档位词表真源（evolution）缺席 —— 不拿自带副本顶替',
        'no-factions': '世界里还没有势力（无东西可算，与「图是空的」不是一回事）', 'empty-graph': '只有一个势力，图算出来了但没有边' };
      return m[r] || ('未能计算：' + r);
    };
    on('#wa-fg-tension', () => {
      const r = WA.factionGraph.tension();
      if (!r.ok) return fgOut(fgWhy(r.reason));
      fgOut('张力 ' + r.value + '（敌对 ' + r.hostile + ' ÷ 边 ' + r.denominator + '；中立边 ' + r.neutral
        + (r.worstTier ? '；最差 ' + r.worstTier : '') + (r.denominatorGuarded ? '；零边：分母已保护' : '') + '）');
    });
    on('#wa-fg-clusters', () => {
      const r = WA.factionGraph.clusters();
      if (!r.ok) return fgOut(fgWhy(r.reason));
      fgOut('同盟簇 ' + r.count + ' 团（≥' + (r.allyTier || '?') + '）：'
        + (r.clusters.map(c => c.join('+')).join(' / ') || '无')
        + '；单点 ' + r.singletons.length + ' 个（图共 ' + r.blocks + ' 块）');
    });
    on('#wa-fg-edges', () => {
      const g = WA.factionGraph.buildGraph();
      if (!g.ok) return fgOut(fgWhy(g.reason));
      fgOut('边 ' + g.edges.length + ' 条（推导值）：' + g.edges.map(e => e.a + '—' + e.b + '：' + e.tier + '(' + e.affinity + ')').join('；'));
    });
    // v2.165.0（TX1）：势力外交八个入口的绑定。
    //   四种「没做成」的情形一律显式报出（不留空面板）：模块缺席 / 开关未开 / 势力名不在
    //   世界里 / 提案阶段不对 —— 空白面板会把「没做」与「做了是空的」塌成一件事。
    //   与上面关系网的关键区别写在按钮 title 里：那栏是推导值，这栏是谈成的事实。
    const dpOut = function (text) { panelEl.dataset.dpOut = text; const o = $('#wa-dp-out'); if (o) o.textContent = text; };
    // v2.165.0（TX1）：启用开关（getSettings / setSettings 的真产品消费方，仿 v2.164.0
    //   wa-bp-enabled 范式）。读面渲染初值，写面落模块设置键；module-missing 如实报，不猜。
    { const el = $('#wa-dp-enabled');
      if (el) el.onchange = function () {
        if (!WA.diplomacy || !WA.diplomacy.setSettings) return dpOut('未记录：module-missing', true);
        WA.diplomacy.setSettings({ enabled: !!el.checked });
        dpOut('已记录 ' + (el.checked ? 'enabled（提案 / 答复 / 签约 / 履约链恢复可用；注入源「外交事实」随总开关出正文）'
          : 'disabled（pairs 与 proposals 仍留在存档里，只是不再提案、不再签约、不再注入）'), true);
      };
    }
    const dpWhy = function (r) {
      const m = { disabled: '外交开关未开（设置里打开后才有外交事实）',
        'missing-fields': '缺字段（看提示里的 hint）',
        'unknown-proposal': '提案号不在册', 'unknown-pair': '成对号不在册或该条款不在有效期内',
        'bad-stage': '提案阶段不对（只有 accepted 可签）',
        'no-authority': '权限预检未过 —— inst.authority 未认可发起方的批准权（查不到不作默许放行）',
        'same-faction': '一对势力必须不同（自己跟自己不是一对）',
        'bad-term': '条款不在词表（支持：trade / mutual-aid / armistice / embargo）' };
      return m[r] || ('未做成：' + r);
    };
    on('#wa-dp-view', () => {
      const v = WA.diplomacy.view();
      if (!v.enabled) return dpOut('外交开关未开（设置里打开后才有外交事实）');
      if (!v.pairs.length && !v.open.length) return dpOut('开关开着但一对都没谈过（「没谈过」不等于「推导图上写着中立」）');
      dpOut('成对 ' + v.counts.pairs + ' / 未结提案 ' + v.counts.open + ' / 条款 ' + v.counts.terms + '：'
        + (v.pairs.map(r => r.a + '×' + r.b + '［' + r.stateLabel + '｜有约 ' + r.activeTerms.length + '］').join('；') || '无成对')
        + (v.open.length ? '｜未结：' + v.open.map(p => p.from + '→' + p.to + '(' + p.stage + ')').join('、') : ''));
    });
    // v2.165.0（TX1）：条款适用性（applies 的真产品消费方）。复用甲/乙输入与条款输入，
    //   答一问：「这一条款此刻对这两家适用吗」——适用 = 条款在生效中（带到期日）。
    //   未接触（unknown）与「谈崩了」不同形，输出里保留 state 让读者分得开。
    on('#wa-dp-applies', () => {
      const a = ($('#wa-dp-a') || {}).value || '', b = ($('#wa-dp-b') || {}).value || '';
      const term = (($('#wa-dp-term') || {}).value || '').trim();
      const r = WA.diplomacy.applies(a, b, term);
      if (!r.ok) return dpOut(dpWhy(r.reason) + (r.hint ? '：' + r.hint : ''));
      dpOut('条款「' + r.term + '」' + (r.applies ? '适用' : '不适用') + '（' + a + '×' + b + '，状态 ' + r.state
        + (r.until ? '，至 ' + r.until : '') + '，pairId ' + (r.pairId || '—') + '）'
        + (r.applies ? '—— 资源后果由调用方经 org 结算，本模块只答适用性'
          : (r.state === 'unknown' ? '—— 未接触即不适用（「没谈过」不等于「谈崩了」）' : '—— 本对没有生效中的该条款')));
    });
    on('#wa-dp-pair', () => {
      const a = ($('#wa-dp-a') || {}).value || '', b = ($('#wa-dp-b') || {}).value || '';
      const r = WA.diplomacy.pairView(a, b);
      if (!r.ok) return dpOut(dpWhy(r.reason) + (r.hint ? '：' + r.hint : ''));
      dpOut(r.state === 'unknown' ? (r.note || '未接触') : (a + ' × ' + b + '：' + r.stateLabel + '（' + r.state + '）'
        + '｜甲→乙 ' + r.att.a2b + ' / 乙→甲 ' + r.att.b2a + '（两个方向各自独立）'
        + '｜有效条款 ' + (r.active.map(x => x.label + (x.until ? '(至' + new Date(x.until).toISOString().slice(0, 10) + ')' : '(无期限)')).join('、') || '无')));
    });
    on('#wa-dp-propose', () => {
      const terms = (($('#wa-dp-terms') || {}).value || '').split(',').map(s => s.trim()).filter(Boolean)
        .map(t => ({ term: t, days: null }));
      const r = WA.diplomacy.propose({ from: ($('#wa-dp-from') || {}).value, to: ($('#wa-dp-to') || {}).value, terms: terms });
      if (!r.ok) return dpOut(dpWhy(r.reason) + (r.hint ? '：' + r.hint : '') + (r.supported ? '（支持：' + r.supported.join('/') + '）' : ''));
      dpOut('提案已立 ' + r.id + '（' + r.stage + '）—— ' + (r.note || ''));
    });
    on('#wa-dp-reply', () => {
      const r = WA.diplomacy.reply({ id: ($('#wa-dp-id') || {}).value, kind: ($('#wa-dp-kind') || {}).value,
        by: ($('#wa-dp-to') || {}).value, basis: ($('#wa-dp-basis') || {}).value });
      if (!r.ok) return dpOut(dpWhy(r.reason) + (r.hint ? '：' + r.hint : ''));
      dpOut('答复已记：' + r.id + ' → ' + r.stage + (r.note ? '（' + r.note + '）' : ''));
    });
    on('#wa-dp-sign', () => {
      const r = WA.diplomacy.sign({ id: ($('#wa-dp-id') || {}).value });
      if (!r.ok) return dpOut(dpWhy(r.reason) + (r.hint ? '：' + r.hint : ''));
      dpOut('已签约 ' + r.pairId + '：状态 ' + r.state + '｜条款 '
        + r.terms.map(x => x.label + (x.until ? '(至' + new Date(x.until).toISOString().slice(0, 10) + ')' : '(无期限)')).join('、'));
    });
    on('#wa-dp-fulfil', () => {
      const r = WA.diplomacy.fulfil({ pairId: ($('#wa-dp-pairid') || {}).value, term: ($('#wa-dp-term') || {}).value,
        evidence: ($('#wa-dp-ev') || {}).value });
      if (!r.ok) return dpOut(dpWhy(r.reason) + (r.hint ? '：' + r.hint : ''));
      dpOut('履约已结算 ' + r.term + '（证据：' + r.evidence + '）');
    });
    on('#wa-dp-breach', () => {
      const r = WA.diplomacy.breach({ pairId: ($('#wa-dp-pairid') || {}).value, term: ($('#wa-dp-term') || {}).value,
        evidence: ($('#wa-dp-ev') || {}).value });
      if (!r.ok) return dpOut(dpWhy(r.reason) + (r.hint ? '：' + r.hint : ''));
      dpOut('违约已留证 ' + r.term + '（状态 ' + r.state + '）—— ' + (r.note || ''));
    });
    on('#wa-dp-expire', () => {
      const r = WA.diplomacy.expire({});
      if (!r.ok) return dpOut(dpWhy(r.reason));
      dpOut('到期收敛：改动 ' + r.changed + ' 处（幂等 —— 同一时刻再点一次应为 0）');
    });
    // v2.166.0（TX2）：行动调度六个入口的绑定。
    //   schedule 与 processReceipts 是 agency 模块两个主入口的真产品消费方。
    //   协调者而非替代者：只调 life / plan / act 既有 API，不复制状态。
    //   schedule 返回 need-steps 时不编步骤——步骤由 AI 文本经结构预检产生或由预设模板提供。
    const agOut = function (text) { panelEl.dataset.agOut = text; const o = $('#wa-ag-out'); if (o) o.textContent = text; };
    { const el = $('#wa-ag-enabled');
      if (el) el.onchange = function () {
        if (!WA.agency || !WA.agency.setSettings) return agOut('未记录：module-missing', true);
        WA.agency.setSettings({ enabled: !!el.checked });
        agOut('已记录 ' + (el.checked ? 'enabled（调度 / 回执链恢复可用；注入源「行动调度」随总开关出正文）' : 'disabled（调度 / 回执链暂停；注入源「行动调度」不出正文）'));
      };
    }
    on('#wa-ag-schedule', () => {
      if (!WA.agency) return agOut('行动调度未加载');
      const v = WA.agency.getSettings();
      if (!v.enabled) return agOut('行动闭环未开（设置里打开后才有调度）');
      const person = wv('#wa-ag-person');
      if (!person) return agOut('填人物名');
      const r = WA.agency.schedule(person, WA.clock && WA.clock.now ? WA.clock.now("agency") : Date.now());
      if (r && r.needSteps) return agOut(person + ' 无计划步——需先为其建立计划步骤（need-steps）');
      if (!r || !r.ok) return agOut(r ? (r.reason || '调度失败') : '调度失败');
      agOut('已调度：' + r.person + ' → 行动「' + r.action + '」（目标 ' + r.goal + '，步 ' + r.stepIndex + '/' + r.stepTotal + '）');
    });
    on('#wa-ag-receipts', () => {
      if (!WA.agency) return agOut('行动调度未加载');
      const v = WA.agency.getSettings();
      if (!v.enabled) return agOut('行动闭环未开');
      const r = WA.agency.processReceipts(WA.clock && WA.clock.now ? WA.clock.now("agency") : Date.now());
      if (!r || !r.ok) return agOut(r ? (r.reason || '处理回执失败') : '处理回执失败');
      agOut('处理回执：结算 ' + r.settled + ' 步（' + (r.details || '') + '）');
    });
    on('#wa-ag-diag', () => {
      if (!WA.agency) return agOut('行动调度未加载');
      const r = WA.agency.diagnose();
      agOut(r.report || '诊断完成');
    });
    // v2.167.0 (TX3): freight panel controls.
    const frOut = function (text) { panelEl.dataset.frOut = text; const o = $('#wa-fr-out'); if (o) o.textContent = text; };
    on('#wa-fr-enabled', 'change', () => {
        if (!WA.freight || !WA.freight.setSettings) return frOut('未记录：module-missing');
        WA.freight.setSettings({ enabled: $('#wa-fr-enabled').checked });
        frOut('已记录 ' + ($('#wa-fr-enabled').checked ? 'enabled' : 'disabled'));
    });
    on('#wa-fr-dispatch', () => {
        if (!WA.freight) return frOut('货运未加载');
        var v = WA.freight.getSettings();
        if (!v.enabled) return frOut('货运未开');
        var route = wv('#wa-fr-route'), from = wv('#wa-fr-from'), res = wv('#wa-fr-res');
        var qty = parseInt(wv('#wa-fr-qty'), 10), days = parseFloat(wv('#wa-fr-days'));
        var r = WA.freight.dispatch(route, from, res, qty, { transitDays: days });
        if (!r || !r.ok) return frOut(r ? (r.reason || '发运失败') : '发运失败');
        frOut('已发运：' + r.id + ' ' + r.from + '->' + r.to + ' ' + r.resource + ' ' + r.qty + '（源库存余 ' + r.stock + '）');
    });
    on('#wa-fr-arrive', () => {
        if (!WA.freight) return frOut('货运未加载');
        if (!WA.freight.getSettings().enabled) return frOut('货运未开');
        var sid = wv('#wa-fr-route');
        var r = WA.freight.arrive(sid, { force: true });
        if (!r || !r.ok) return frOut(r ? (r.reason || '到货失败') : '到货失败');
        frOut('已到货：' + r.id + ' ' + r.resource + ' ' + r.qty + '->' + r.to + '（库存 ' + r.stock + '）');
    });
    on('#wa-fr-cancel', () => {
        if (!WA.freight) return frOut('货运未加载');
        if (!WA.freight.getSettings().enabled) return frOut('货运未开');
        var sid = wv('#wa-fr-route');
        var r = WA.freight.cancel(sid);
        if (!r || !r.ok) return frOut(r ? (r.reason || '取消失败') : '取消失败');
        frOut('已取消：' + r.id + ' 退货 ' + r.refund + ' 损运费 ' + r.loss);
    });
    on('#wa-fr-reroute', () => {
        if (!WA.freight) return frOut('货运未加载');
        if (!WA.freight.getSettings().enabled) return frOut('货运未开');
        var sid = wv('#wa-fr-route');
        var nr = wv('#wa-fr-from');
        var days = parseFloat(wv('#wa-fr-days')) || 5;
        var r = WA.freight.reroute(sid, nr, { transitDays: days });
        if (!r || !r.ok) return frOut(r ? (r.reason || '改道失败') : '改道失败');
        frOut('已改道：' + r.id + ' 新路线 ' + r.newRouteId);
    });
    on('#wa-fr-view', () => {
        if (!WA.freight) return frOut('货运未加载');
        var sid = wv('#wa-fr-route');
        var r = WA.freight.view(sid);
        if (!r || !r.ok) return frOut(r ? (r.reason || '查看失败') : '查看失败');
        frOut(r.id + ' ' + r.status + ' ' + r.from + '->' + r.to + ' ' + r.resource + ' ' + r.qty + ' | ' + r.conservation);
    });
    on('#wa-fr-diag', () => {
        if (!WA.freight) return frOut('货运未加载');
        var r = WA.freight.diagnose();
        if (!r) return frOut('诊断失败');
        frOut('enabled=' + r.enabled + ' closedLoop=' + r.closedLoop + ' economy=' + r.economyAvailable + ' store=' + r.storeAvailable + ' shipments=' + r.shipments + ' transit=' + r.inTransit + ' cap=' + r.cap);
    });

    // v2.139.0（E9）：单对势力查边（`edgeOf` 的真产品消费方）。
    //   为什么不是又一个「看全部」按钮：上面那枚答「这张网长什么样」，这一枚答
    //   「**就这两个**到底什么关系」—— 势力多起来之后逐条读全表不可用，
    //   而「两家的关系」是最常被问的那一问。
    on('#wa-fg-pair', () => {
      const a = wv('#wa-fg-pa'), b = wv('#wa-fg-pb');
      const r = WA.factionGraph.edgeOf(a, b);
      if (!r.ok) return fgOut(fgWhy(r.reason) + (r.reason === 'bad-faction' ? '（自环与未知势力名都算「不是一条边」）' : ''));
      fgOut(a + '—' + b + '：' + r.edge.tier + '（亲疏 ' + r.edge.affinity + '，由 ' + r.edge.basis.join(' 与 ') + ' 推出——推导值不是观测值）');
    });
    // v2.139.0（E9）：最紧张的是谁（`heat` 的真产品消费方）。
    //   逐节点热度排行：`unknowns` 与 `hostiles` 分列 —— 前者是「不知道」，后者是「知道是零」。
    on('#wa-fg-hot', () => {
      const r = WA.factionGraph.heat();
      if (!r.ok) return fgOut(fgWhy(r.reason));
      fgOut('最紧张：' + (r.rows.slice(0, 4).map(x => x.name + '（敌对 ' + x.hostiles + ' / 同盟 ' + x.allies
        + (x.unknowns ? ' / 档位不明 ' + x.unknowns : '') + '）').join('、') || '无')
        + '；共 ' + r.nodes + ' 家');
    });
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
      const ss = $('#wa-snap-subset');
      if (ss && WA.toolSnapshot) ss.onclick = () => {
        const names = ($('#wa-snap-faces').value || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!names.length) { $('#wa-snap-out').textContent = '请先填面名（逗号分隔）'; return; }
        const r = WA.toolSnapshot.buildSubsetPayload(names);
        $('#wa-snap-out').textContent = '子集：' + r.subsetFaces.join('、')
          + (r.meta.dropped.length ? '；未识别丢弃 ' + r.meta.dropped.join('、') : '；无丢弃');
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
        // v2.87.0 A5 收口：导入差异预览（与真跑同一批准入函数，零副作用）
        const pl = (typeof WA.toolImport.previewPlan === 'function') ? WA.toolImport.previewPlan(raw) : null;
        const planPv = (pl && pl.ok) ? ('｜将新增 ' + (pl.willAdd || 0) + ' / 跳过 ' + (pl.willSkip || 0) + (pl.note ? '（' + pl.note + '）' : '')) : (pl ? ('｜预览不可用：' + pl.reason) : '');
        const r = WA.toolImport.importData(raw);
        out.textContent = (r.ok ? '✓ [' + pv.kind + '] ' : '✗ [' + pv.kind + '] ')
          + planPv
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
    on('#wa-log-err', () => { __logErrOnly = !__logErrOnly; renderBody(); __persistPanel(); });   // v2.109.0（#15）：开关即落盘
    on('#wa-err-report', () => { if (navigator.clipboard && WA.toolDiag && WA.toolDiag.buildErrorReport) { navigator.clipboard.writeText(WA.toolDiag.buildErrorReport()); const tip = $('#wa-err-report'); if (tip) { tip.textContent = '已复制✓'; setTimeout(() => { tip.textContent = '复制错误报告'; renderBody(); }, 1500); } } });
    on('#wa-audit-copy', () => { if (navigator.clipboard && WA.store && WA.store.exportAuditReport) { navigator.clipboard.writeText(WA.store.exportAuditReport()); const out = $('#wa-diag-out'); if (out) out.textContent = '✓ 内存/持久化审计报告 (sizeAudit) 已复制到剪贴板！'; } });
    // ── v2.121.0 P1：审计卷（跨会话可查）。**显式触发**——本模块不自动落盘，
    //   与磁带卷（v2.98.0 P2）/ 流水卷（v2.94.0 O6）同规格：要不要把这一卷带出会话，
    //   是按下这一刻的决定。这两枚按钮就是 exportVol / verifyVolWith 的真消费方。
    const auditOut = (html) => { const o = $('#wa-audit-vol-out'); if (o) o.innerHTML = html; };
    on('#wa-audit-vol', () => {
      if (!WA.auditLog || typeof WA.auditLog.exportVol !== 'function') { auditOut('<div class="wa-dim">审计模块未加载</div>'); return; }
      let v = null; try { v = WA.auditLog.exportVol(); } catch (e) { return auditOut('<div class="wa-dim">导出审计失败：导出抛错（export-throw）</div>'); }
      if (!v || !v.ok) { auditOut('<div class="wa-dim">导出审计：' + esc((v && v.reason) || 'export-throw') + '（卷不可导出）</div>'); return; }
      const t = $('#wa-audit-vol-text');
      const json = JSON.stringify(v);
      if (t) t.value = json;
      // 「空环」与「导不出」是两件事：空环导出成功但 0 条，照实说没东西可核，不假装导出了证据。
      const summary = '审计卷 · ' + esc(v.format) + ' v' + v.formatVersion + ' · ' + v.entries + ' 条'
        + '｜环容量 ' + v.cap + '｜累计记录 ' + v.recorded + '｜挤出 ' + v.dropped
        + (v.truncated ? ' · <b>已截断</b>：环挤过 ⇒ 卷首无上游可核，只含带内' : ' · 完整卷（环未挤出过）')
        + (v.lineageResets ? ' · 谱系重启过 ' + v.lineageResets + ' 次（reset 是唯一来源）' : '');
      auditOut('<div class="wa-item"><b>已导出一卷审计</b>：' + summary
        + '<div class="wa-dim">' + (v.entries ? '卷已填进下面的粘贴框（' + json.length + ' 字符）——把它带到别处（或下一节会话），再用「带外核对」核。'
          : '环里此刻一条都没有——导出成功了，但没什么可核的（「空环」与「导不出」是两件事）。')
        + '注意本模块<b>没有</b>替你写盘：要不要留下这一卷由你决定。</div></div>');
    });
    on('#wa-audit-vol-check', () => {
      if (!WA.auditLog || typeof WA.auditLog.verifyVolWith !== 'function') { auditOut('<div class="wa-dim">审计模块未加载</div>'); return; }
      const raw = ($('#wa-audit-vol-text') ? ($('#wa-audit-vol-text').value || '') : '').trim();
      // 没有卷时不假装核对过：「没核」与「核过一致」是两件事（与磁带/流水两口的 no-volume 同口径）。
      if (!raw) { auditOut('<div class="wa-dim">带外核对：no-volume —— 先把一卷审计粘进上面的框里再核。'
        + '<br>（本侧不会替你从 localStorage 里找一个卷出来：那样做等于假装有第二份真源，而读回不比对任何东西。）</div>'); return; }
      let vol = null;
      try { vol = JSON.parse(raw); } catch (e) { auditOut('<div class="wa-dim">带外核对：bad-volume —— 粘进来的不是合法 JSON（' + esc(String(e && e.message || e)) + '）</div>'); return; }
      let r = null; try { r = WA.auditLog.verifyVolWith(vol); } catch (e) { auditOut('<div class="wa-dim">带外核对：核对抛错（本口承诺不抛——这是一个缺陷，不是配置问题）</div>'); return; }
      if (!r) { auditOut('<div class="wa-dim">带外核对：无结论</div>'); return; }
      // 拒收（格式头/行面）照原码带出，不与「核过了但不一致」混成一句
      if (r.ok === false && r.reason) {
        const want = r.want !== undefined ? ('（期望 ' + esc(String(r.want)) + '，实为 ' + esc(String(r.got)) + '）') : '';
        auditOut('<div class="wa-item"><b>带外核对：卷不合规，未核对</b> ' + esc(String(r.reason)) + want
          + (r.reason === 'bad-rows' ? '<div class="wa-dim">行面读不了——卷里的条不是对象。连读都读不了的卷不该说成「核对不一致」，两者是两件事。</div>' : '')
          + '</div>');
        return;
      }
      if (r.outcome === 'empty') { auditOut('<div class="wa-item"><b>带外核对</b>：卷里一条都没有（empty）——「空卷」不等于「核过且一致」，本口不把它算作通过。</div>'); return; }
      const seqLine = r.seqOk ? '序号链完整（' + r.entries + ' 条逐条 +1，无跳号）'
        : '<b>序号链断了</b> ' + (r.seqBroken || []).length + ' 处（首处第 ' + ((r.seqBroken || [{}])[0].at | 0) + ' 条：期望 seq=' + ((r.seqBroken || [{}])[0].want) + '，实为 ' + esc(String((r.seqBroken || [{}])[0].got)) + '）'
          + '——这卷被改过，或由别的东西拼出来';
      const atLine = r.atOk ? '时间链未倒退（本批 ' + r.entries + ' 条时间戳单调）'
        : '<b>时间链倒退</b> ' + (r.atRegressions || []).length + ' 处（首处第 ' + ((r.atRegressions || [{}])[0].at | 0) + ' 条）——一定被动过';
      // 「自称完整却缺头」单独念：它不是「被删过行」的直接证据，但两者在同一句话里说不清时
      //   读的人会自己编一句（卷首 seq 不从 1 起有两种成因：缺头，或 reset 后的新谱系）。
      const headLine = r.headless
        ? '<b>自称完整却缺头</b>：卷首 seq=' + esc(String(vol.rows[0].seq)) + ' 而非 1，但卷自称未截断——成因要么是卷首被删，要么是 reset 后的新谱系（卷内 lineageResets 可分辨）。'
        : '卷首序号与自称一致。';
      auditOut('<div class="wa-item"><b>带外核对（零状态触碰：不并入环、不改序号、不写盘）</b>'
        + '<div class="wa-dim">' + seqLine + '</div>'
        + '<div class="wa-dim">' + atLine + '</div>'
        + '<div class="wa-dim">' + headLine + '</div>'
        + '<div class="wa-dim">核的是<b>卷自身</b>：本侧不回答「它与本机 localStorage 里那份是否一致」——读回不比对任何东西，两者是两条不同的证据。</div>'
        + '</div>');
    });
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
    // v2.159.0（TP2）：异步写回台账——被拒的写回必须可见。此前「模型没返回」与
    //   「返回了但被归属检查丢掉」同形，用户只看到摘要/档案不动，无从判断原因。
    const clBtn = $('#wa-claim-view');
    if (clBtn) clBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.store || !WA.store.claimStat) return;
      try {
        const c = WA.store.claimStat();
        const by = Object.keys(c.byReason || {}).map(k => k + '×' + c.byReason[k]).join(' · ') || '无';
        let html = '<div class="wa-log wa-log-' + (c.blocked ? 'warn' : 'info') + '">异步写回票据：发 ' + c.issued
          + ' · 放行 ' + c.passed + ' · 拒收 ' + c.blocked + ' · 过期 ' + c.expired + ' · 在册 ' + c.live
          + '<br>拒收归因：' + esc(by) + '</div>'
          + '<div class="wa-item">去重键在册 ' + esc(String(c.keys)) + ' / 上限 ' + esc(String(c.cap))
          + ' · 票据有效期 ' + Math.round(c.ttlMs / 60000) + ' 分钟</div>'
          + '<div class="wa-item">最近判据：<b>' + esc(String(c.lastReason || '-')) + '</b>'
          + (c.lastDepChanged ? '<div class="wa-dim">⚠ 最近一次拒收因「依赖读面已变」——这次结论建立在过期的输入上</div>' : '')
          + (c.lastRevChanged ? '<div class="wa-dim">注：最近一次放行时世界版本已变化（已记账，未拒收）</div>' : '') + '</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '票据台账读取失败：' + (e && e.message); }
    };
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
    // v2.101.0（O11）：跨插件互操作验收面出口——interop.probeAll / summaryText / freeze
    //   此前零消费（新模块只有测试在活，而「只在测试里活的导出不算交付」）。
    //   两枚按钮与宿主兼容层同规格：只写 #wa-diag-out、只读、不驱动对方重建快照。
    const netView = $('#wa-net-view');
    if (netView) netView.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const r = WA.interop.probeAll();
        let html = '<div class="wa-sec">跨插件互操作（三伙伴五态分列）</div>';
        html += r.rows.map(function (x) {
          const on = x.state === 'ready';
          return '<div class="wa-item"><b>' + esc(x.label) + '</b> '
            + (on ? '<span class="wa-badge wa-on">ready</span>' : '<span class="wa-badge">' + esc(x.state) + '</span>')
            + '<br><span class="wa-dim">' + esc(x.duty) + ' · ' + esc(x.detail) + '（凭 ' + esc(x.evidence) + '）</span></div>';
        }).join('');
        html += '<div class="wa-dim">' + esc(WA.interop.summaryText())
          + ' —— 「探不出」（unknown）与「它不在」（absent）处置相反，故分列不合并。</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '互操作面读取失败：' + (e && e.message); }
    };
    const netFreeze = $('#wa-net-freeze');
    if (netFreeze) netFreeze.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const f = WA.interop.freeze();
        let html = '<div class="wa-sec">协议冻结面（外部读者认的字符串）</div>';
        html += f.bridges.map(function (b) {
          return '<div class="wa-item"><b>' + esc(String(b.id)) + '</b> v' + esc(String(b.version))
            + ' · ' + esc(b.direction) + '<br><span class="wa-dim">' + esc(b.duty) + '</span></div>';
        }).join('');
        html += '<div class="wa-item">拒收码：入站 ' + f.rejectCodes.inbound.length + ' 枚 / 读面 '
          + f.rejectCodes.readFace.length + ' 枚<br><span class="wa-dim">'
          + esc(f.rejectCodes.inbound.concat(f.rejectCodes.readFace).join(' / ')) + '</span></div>';
        html += '<div class="wa-dim">诊断节键：' + esc(f.diagSections.join(' / ')) + '</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '冻结面读取失败：' + (e && e.message); }
    };
    // v2.102.0（A2/O12）：性能基线与分层增量两枚出口——WA.perfTrace 此前只活在测试里
    //   （「只在测试里活的导出不算交付」）。两枚按钮同 v2.101.0 规格：只写 #wa-diag-out、
    //   只读、不改设置、不落盘。区别在**代价**：读曲线不跑基准（看一眼体检 ≠ 跑一轮全量），
    //   测本轮才真跑冷/热两趟，并把「复用值 == 现算值」的复核结论一并念出来。
    //   两枚都足量消费真导出（summaryText / split / curve / LAYERS / coldStart / warmStart）。
    const perfView = $('#wa-perf-view');
    if (perfView) perfView.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const sp = WA.perfTrace.split(), stv = WA.perfTrace.stat();
        let html = '<div class="wa-sec">性能面（已发生的读数；本按钮不触发基准）</div>';
        html += '<div class="wa-item"><b>' + esc(WA.perfTrace.summaryText()) + '</b></div>';
        html += '<div class="wa-kv"><span>本地 / 序列化 / 宿主 / 渲染</span><b>'
          + esc(sp.localMs + 'ms / ' + sp.serializeMs + 'ms / '
            + (sp.declared.host ? sp.hostMs + 'ms' : '未上报') + ' / '
            + (sp.declared.render ? sp.renderMs + 'ms' : '未上报')) + '</b></div>';
        if ((sp.undeclared || []).length) {
          html += '<div class="wa-dim wa-log-warn">未上报分列：' + esc(sp.undeclared.join(' / '))
            + ' —— 「没人报」不写成 0ms（无头回归里 ui/panel.js 根本不装载）</div>';
        }
        WA.perfTrace.LAYERS.forEach(function (L) {
          const c = WA.perfTrace.curveAll()[L], b = WA.perfTrace.baseline(L);
          html += '<div class="wa-item"><b>' + esc(L) + '</b> <span class="wa-dim">' + esc(WA.perfTrace.LAYER_LABEL[L] || '') + '</span>'
            + '<div class="wa-kv"><span>P50 / P95 / 峰值</span><b>' + c.p50 + 'ms / ' + c.p95 + 'ms / ' + c.max + 'ms</b></div>'
            + '<div class="wa-kv"><span>样本</span><b>' + c.n + ' 次（窗口 ' + c.window + '/' + WA.perfTrace.HISTORY_CAP
            + '，挤出 ' + c.dropped + '；低于 1ms ' + c.subTick + ' 次）</b></div>'
            + '<div class="wa-kv"><span>上次真算于</span><b>' + (b.lastAt ? new Date(b.lastAt).toISOString() : '从未') + '</b></div></div>';
        });
        const dirty = WA.perfTrace.dirtyAll();
        const dk = WA.perfTrace.LAYERS.filter(function (L) { return (dirty[L] || []).length; });
        html += '<div class="wa-dim">脏集：'
          + (dk.length ? dk.map(function (L) { return esc(L + '(' + dirty[L].join(',') + ')'); }).join('、')
            : '无（各层输入指纹自上次消费以来未变）')
          + '；复用 ' + stv.reuse + ' / 重算 ' + stv.recompute + ' / 失败 ' + stv.miss + ' / 挤出 ' + stv.evicted + '</div>';
        // v2.109.0（#9 缓存治理 / #10 劣化告警 / #11 火焰图）三面接真消费方。
        //   这三块此前**只活在测试里**：dead-export-gate 把 cacheStat / heatHistogram /
        //   thresholds / spikeOf / alerts / flamegraph 逐条记成 test-only 或 self-only。
        //   接在这里的理由与 v2.102.0 同一条：写在源码里而无人消费的读数 = 不存在。
        //   三块都**纯读**：不跑基准、不改设置、不落盘（看一眼体检不该有副作用）。
        try {
          const cs = WA.perfTrace.cacheStat();
          html += '<div class="wa-item"><b>指纹缓存</b> <span class="wa-dim">策略 ' + esc(cs.policy)
            + '（可选 ' + esc(cs.policies.join('/')) + '）· 上限 ' + cs.cap + ' 槽/层</span>'
            + '<div class="wa-kv"><span>占用</span><b>' + cs.total + ' 槽（'
            + WA.perfTrace.LAYERS.map(function (L) { return esc(L) + ' ' + cs.per[L]; }).join(' / ')
            + '）</b></div>'
            + '<div class="wa-kv"><span>挤出</span><b>' + cs.evicted + ' 次（其中按策略淘汰 ' + cs.evictedPolicy
            + ' 次）</b></div></div>';
          const heat = WA.perfTrace.heatHistogram();
          html += '<div class="wa-dim">热度分布（按最近访问年龄）：' + esc(heat.buckets.map(function (b) {
            return b.label + ' ' + b.n;
          }).join('　')) + '（共 ' + heat.total + ' 槽）</div>';
          const th = WA.perfTrace.thresholds();
          html += '<div class="wa-dim">劣化阈值：' + th.factor + 'x（≥ ' + th.minSamples + ' 样本且差 ≥ '
            + th.minMs + 'ms 才算）—— 阈值是**倍数**不是毫秒：墙钟跨机差 3 倍以上，绝对数当阈值会换台机就假红</div>';
          html += WA.perfTrace.LAYERS.map(function (L) {
            const sp = WA.perfTrace.spikeOf(L);
            const kind = !sp.ok ? ('不判（' + esc(sp.kind) + '，窗口 ' + sp.window + '/' + sp.need + '）')
              : (sp.spiking ? '长尾偏大 ' + sp.ratio + 'x' : '平稳 ' + sp.ratio + 'x');
            return '<div class="wa-kv"><span>' + esc(L) + ' 稳定性</span><b>' + kind + '</b></div>';
          }).join('');
          const al = WA.perfTrace.alerts();
          html += '<div class="wa-dim' + (al.n ? ' wa-log-warn' : '') + '">劣化告警：'
            + (al.n ? esc(al.alerts.map(function (x) { return x.layer + '/' + x.kind + '（' + x.detail + '）'; }).join('；'))
              : '无（各层 P95/P50 未越阈值，或样本不足未判）') + '</div>';
          const fg = WA.perfTrace.flamegraph({ format: 'folded' });
          if (fg.ok) {
            const firstLines = String(fg.text).split(String.fromCharCode(10)).slice(0, 6);
            html += '<div class="wa-item"><b>逻辑火焰图</b> <span class="wa-dim">' + esc(fg.note || '')
              + '</span><div class="wa-dim">' + esc(firstLines.join(' ｜ '))
              + (fg.frames > firstLines.length ? '　…（共 ' + fg.frames + ' 帧，完整文本用 flamegraph())' : '') + '</div></div>';
          }
        } catch (e) { html += '<div class="wa-dim wa-log-warn">缓存/告警/火焰图读数失败：' + esc(e && e.message) + '</div>'; }
        out.innerHTML = html;
      } catch (e) { out.textContent = '性能面读取失败：' + (e && e.message); }
    };
    const perfBench = $('#wa-perf-bench');
    if (perfBench) perfBench.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const c = WA.perfTrace.coldStart();
        const w = WA.perfTrace.warmStart();
        let html = '<div class="wa-sec">冷启 / 热启（真跑四个面：注入 / 诊断 / 原著对位 / 世界状态）</div>';
        html += '<div class="wa-item"><b>冷启 ' + c.totalMs + 'ms</b> · 就绪 ' + c.cold + ' 面 / 缺席 ' + c.absent
          + '<br><span class="wa-dim">' + (c.rows.map(function (r) {
            return esc(r.face + ' ' + (r.absent ? '缺席' : r.ms + 'ms'));
          }).join('｜')) + '</span></div>';
        html += '<div class="wa-item"><b>热启 ' + w.totalMs + 'ms</b> · 复用 ' + w.reused + ' / 重算 ' + w.recomputed
          + '<br><span class="wa-dim">' + (w.rows.map(function (r) {
            return esc(r.face + ' ' + (r.hit ? '复用' : r.ms + 'ms'));
          }).join('｜')) + '</span></div>';
        html += '<div class="wa-kv"><span>复用值与现算值指纹一致</span><b>'
          + (w.consistent === null
            ? '不可判（本次没有复用项——一致性判据不是「恒真」）'
            : (w.consistent ? '是（' + w.checked + ' 面已复核）' : '否 —— ' + esc(w.consistentNote || '')))
          + '</b></div>';
        if ((w.stale || []).length || (w.volatile || []).length) {
          html += '<div class="wa-dim' + ((w.stale || []).length ? ' wa-log-warn' : '') + '">'
            + ((w.stale || []).length ? '缓存过期（本面缺陷）：' + esc(w.stale.join('/')) + '　' : '')
            + ((w.volatile || []).length ? '被观测面自身不可复现（非缓存缺陷，该面本就不会命中）：' + esc(w.volatile.join('/')) : '')
            + '</div>';
        }
        // v2.109.0（#7）：与**上一次**按下的基线比对（同会话内自比，故 sameHost 成立）。
        //   为什么不留「与当前比」：那是恒等比对（ratio 恒 1），读数看起来有值却没有意义。
        //   真正的用法就是「先量一次、改点东西、再量一次」——故基线存在模块级变量里。
        try {
          const snap = WA.perfTrace.snapshot('panel-bench');
          if (lastPerfSnap) {
            const cmp = WA.perfTrace.importSnapshot(lastPerfSnap, { sameHost: true });
            html += '<div class="wa-item"><b>与上次基准比对</b> <span class="wa-dim">'
              + esc(cmp.note || '') + '</span>'
              + '<div class="wa-kv"><span>结构面</span><b>'
              + (cmp.struct.length ? esc(cmp.struct.join('；')) : '一致（缓存上限 / 面数未变）') + '</b></div>'
              + cmp.rows.map(function (r) {
                return '<div class="wa-kv"><span>' + esc(r.layer) + '</span><b>' + esc(r.verdict)
                  + (r.ratio ? '　' + r.ratio + 'x（' + r.then.p95 + ' → ' + r.now.p95 + 'ms）' : '') + '</b></div>';
              }).join('')
              + (cmp.problems.length ? '<div class="wa-dim wa-log-warn">问题：' + esc(cmp.problems.join('；')) + '</div>' : '')
              + '</div>';
          } else {
            html += '<div class="wa-dim">首次基准：已记为基线（再按一次即可与本次比对；'
              + '快照带 comparable.ms=false —— 墙钟跨机不可比，跨机只判结构面）</div>';
          }
          lastPerfSnap = snap;
        } catch (e) { html += '<div class="wa-dim wa-log-warn">基准比对失败：' + esc(e && e.message) + '</div>'; }
        html += '<div class="wa-dim">' + esc(WA.perfTrace.summaryText()) + '；基准档位 '
          + esc(WA.perfTrace.CLASSES.join(' / ')) + '（lowend 为同机放大估计，真机读数须实机）</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '基准失败：' + (e && e.message); }
    };
    // v2.102.0（A2/O12）：增量面出口——`partial()` 按**每一面自己的输入**（世界步进
    //   `stateRev`）决定重算还是复用。与「基准面」的区别是**代价与判据**：这一枚
    //   在无写入时应当一次活都不干（reused 4 / recomputed 0），而改过世界再点就如实重算。
    //   只读、不落盘、不改设置；读数里带着「按哪个世界步进算的」以便复算。
    const perfPartial = $('#wa-perf-partial');
    if (perfPartial) perfPartial.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const p = WA.perfTrace.partial(), stv = WA.perfTrace.stat();
        let html = '<div class="wa-sec">增量面（按每面自己的输入决定重算；本按钮不改世界）</div>';
        html += '<div class="wa-kv"><span>世界步进</span><b>'
          + (p.revOk ? 'stateRev ' + p.rev : '不可读（' + esc(p.revKind) + '）—— 输入判不出来的面一律重算')
          + '</b></div>';
        html += '<div class="wa-kv"><span>本轮复用 / 重算</span><b>' + p.reused + ' / ' + p.recomputed
          + '　<span class="wa-dim">共 ' + p.rows.length + ' 面，缺席 ' + p.absent + '</span></b></div>';
        html += WA.perfTrace.LAYERS.map(function (L) {
          const r = p.rows.filter(function (x) { return x.layer === L; })[0];
          if (!r) return '';
          return '<div class="wa-item"><b>' + esc(L) + '</b> <span class="wa-dim">' + esc(WA.perfTrace.LAYER_LABEL[L] || '') + '</span>'
            + '<div class="wa-kv"><span>处置</span><b>' + (r.absent ? '缺席' : (r.hit ? '复用（输入未变）' : '重算 ' + r.ms + 'ms'))
            + '</b></div>'
            + '<div class="wa-kv"><span>输入</span><b>' + esc(r.inputKind) + (r.inputOk ? '（rev ' + r.inputRev + '）' : '')
            + '</b></div></div>';
        }).join('');
        html += WA.perfTrace.LAYERS.map(function (L) {
          const sl = WA.perfTrace.slots(L);
          if (!sl.length) return '';
          return '<div class="wa-item"><b>' + esc(L) + '</b> <span class="wa-dim">' + sl.length + ' 个缓存槽</span>'
            + sl.slice(0, 6).map(function (x) {
              return '<div class="wa-kv"><span>' + esc(x.key) + '</span><b>命中 ' + x.hits + ' / 过期 ' + x.stale
                + '　<span class="wa-dim">' + esc(String(x.vfp).slice(0, 8)) + '</span></b></div>';
            }).join('') + '</div>';
        }).join('');
        html += '<div class="wa-dim">增量累计：调用 ' + stv.partialCalls + ' 次 / 复用 ' + stv.partialReused
          + ' 面；已知边界：canonAlign 的幕表住在设置侧（不在 stateRev 里），单改幕表不会被判脏</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '增量面读取失败：' + (e && e.message); }
    };
    // v2.123.0 P4：**档位面**——`bench()` 与成本账此前都只给**单点**读数。
    //   「够快吗」没有一个可比的参照系，而四类耗时（本地 / 宿主 API / 序列化 / 渲染）
    //   全混在一个 totalMs 里。本块把四档并排，并把**本地面**与 **API 面**分开列。
    //   两条口径在读数上直接可见：
    //     · 每档取**本档前后的差值**（`_span` 是自装载以来的累计桶，直接读会把前三档算进第四档）；
    //     · 宿主 API 无上报时如实说「未上报」，**不写成 0ms**。
    const perfBand = $('#wa-perf-band');
    if (perfBand) perfBand.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const r = WA.perfTrace.bandCompare();
        let html = '<div class="wa-sec">档位面（四档并排 + 本地 / 宿主 API 分列；每档取本档前后的差值）</div>';
        html += '<div class="wa-dim">' + esc(r.note) + '</div>';
        r.classes.forEach(function (C) {
          const b = r.bands[C];
          html += '<div class="wa-item"><b>' + esc(C) + '</b>'
            + ' <span class="wa-dim">' + esc(b.note || '') + '</span>'
            + (b.judgeable ? '' : ' <span class="wa-log-warn">（估计值，不参与判定）</span>')
            + '<div class="wa-kv"><span>合计</span><b>' + esc(String(b.totalMs)) + 'ms'
            + '<span class="wa-dim">（重复 ' + esc(String(b.repeats)) + ' 遍 / 预算 ' + esc(String(b.budget)) + 't / '
            + esc(String(b.faces)) + ' 面）</span></b></div>'
            + '<div class="wa-kv"><span>本档本地 / 序列化</span><b>' + esc(String(b.split.localMs)) + 'ms / '
            + esc(String(b.split.serializeMs)) + 'ms</b></div>'
            + '<div class="wa-kv"><span>本档宿主 API</span><b>'
            + (b.split.apiReported ? esc(String(b.split.hostMs)) + 'ms' : '未上报')
            + '<span class="wa-dim">（宿主调用面由外部上报；本面无上报时不写成 0ms）</span></b></div>'
            + '<div class="wa-kv"><span>样本</span><b>' + esc(String(b.samples && b.samples.n))
            + ' 次（门槛 ' + esc(String(b.minSamples)) + '）' + ((b.samples && b.samples.sufficient) ? '' : '（尚不足）') + '</b></div></div>';
        });
        html += '<div class="wa-dim">' + esc(r.driftNote) + '</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '档位面读取失败：' + (e && e.message); }
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
    // v2.83.0（B6）: 配置包出口——此前「配置能不能整包搬走」在库里没有任何实现，
    //   于是用户换设备/换聊天只能逐项重设，或把整份诊断包当配置搬运（含存档与日志，
    //   既不安全也不精确）。本块给 exportConfig/importConfig 一个真实消费点。
    //   面板只做**一层**：读出口读数 + 导出一份包到诊断输出区。导入是破坏性操作，
    //   留待有明确意图的调用方（脚本/诊断），不在面板上放一个「粘贴即覆盖」的按钮。
    const cfgBtn = $('#wa-cfg-view');
    if (cfgBtn) cfgBtn.onclick = () => {
      const out = $('#wa-diag-out'); if (!out || !WA.settingsBus) return;
      try {
        const st = (WA.settingsBus.cfgStat) ? WA.settingsBus.cfgStat() : null;
        const sf = (WA.settingsBus.cfgSurface) ? WA.settingsBus.cfgSurface() : null;
        const li = (WA.settingsBus.selfCheck) ? (WA.settingsBus.selfCheck().lifecycle || null) : null;
        let html = '<div class="wa-item"><b>配置包</b>：schema ' + (st ? st.schema : '?')
          + ' · 格式 ' + esc(st ? st.format : '?')
          + ' · 未知键策略 ' + esc(st ? st.unknownKeyPolicy : '?') + '</div>';
        if (sf) {
          html += '<div class="wa-dim">当前配置面：已登记键 ' + sf.registered + ' 个'
            + (sf.unregistered ? ' · 未登记键 ' + sf.unregistered + ' 个（仍属用户数据，按设置家族一并入包）' : '')
            + ' · ' + Math.round(sf.bytes / 1024) + 'KB</div>';
        }
        if (li && li.migrations) {
          html += '<div class="wa-dim">声明了结构迁移的键 ' + li.migrations + ' 个 · 本会话迁移 ' + (li.migratedThisSession || 0) + ' 个</div>';
        }
        if (st) {
          html += '<div class="wa-dim">导入导出台账：导出 ' + st.exports + ' 次 · 导入 ' + st.imports
            + ' 次（失败 ' + st.importFailed + ' 次）· 备份环 ' + st.backupCount + '/' + st.maxBackups
            + '（' + Math.round(st.backupBytes / 1024) + 'KB）</div>';
          if (st.lastImport) {
            html += '<div class="wa-log wa-log-' + (st.lastImport.ok ? 'info' : 'warn') + '">最近导入：'
              + esc(st.lastImport.code) + (st.lastImport.detail ? '（' + esc(String(st.lastImport.detail).slice(0, 80)) + '）' : '')
              + (st.lastImport.ok ? ' · 成功写入 ' + (st.lastImport.applied || 0) + ' 个键' : ' · 当前配置未被改动') + '</div>';
          }
          if (st.backups.length) {
            html += '<div class="wa-dim">备份（导入前自动留，环形 ' + st.maxBackups + ' 份）：'
              + st.backups.map(function (b) { return esc(b.key.replace('worldaxis_cfgbackup_', '')) + ' ' + Math.round(b.bytes / 1024) + 'KB'; }).join(' · ') + '</div>';
          }
        }
        const ex = WA.settingsBus.exportConfig();
        html += '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-cfg-copy">复制配置包</button>'
          + '<button class="wa-btn wa-mini" id="wa-cfg-import">导入配置包…</button></div>';
        out.innerHTML = html;
        const cb = $('#wa-cfg-copy');
        if (cb) cb.onclick = () => {
          const o2 = $('#wa-diag-out');
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(ex.text);
              if (o2) o2.innerHTML += '<div class="wa-log wa-log-info">✓ 配置包已复制（' + Math.round(ex.bytes / 1024) + 'KB，含 ' + ex.keys + ' 个已登记键）</div>';
            } else if (o2) {
              o2.innerHTML += '<div class="wa-log wa-log-warn">剪贴板不可用；配置包已写入控制台（console）</div>';
              try { console.log('[世界枢轴] 配置包：' + ex.text); } catch (e2) {}
            }
          } catch (e2) {
            if (o2) o2.innerHTML += '<div class="wa-log wa-log-err">复制失败：' + esc(String(e2 && e2.message)) + '</div>';
          }
        };
        // 导入：两阶段（先粘文本 + 校验，再二次确认才写入）。
        //   为什么不在第一屏就粘 + 写：导入是**破坏性**的（覆盖设置家族键），
        //   与「存储键体检」的确认清理、「恢复到此点」的二次确认同规格。
        //   第一阶段的校验用真实 importConfig 的**拒收面**（不写盘），
        //   故用户看到的是「这个包会被怎么处置」，而不是一个空按钮。
        const ib = $('#wa-cfg-import');
        if (ib) ib.onclick = () => {
          const o2 = $('#wa-diag-out'); if (!o2) return;
          o2.innerHTML = '<div class="wa-dim">把配置包 JSON 粘贴到下面，先校验（此阶段不写入任何东西）：</div>'
            + '<textarea id="wa-cfg-text" class="wa-input" rows="4" style="width:100%"></textarea>'
            + '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-cfg-check">校验</button>'
            + '<button class="wa-btn wa-mini" id="wa-cfg-cancel">取消</button></div>';
          const ck = $('#wa-cfg-check');
          if (ck) ck.onclick = async () => {
            const txt = ($('#wa-cfg-text') || {}).value || '';
            let pre = null;
            try { pre = JSON.parse(txt); } catch (e3) { pre = null; }
            if (!pre || pre.format !== 'worldaxis-config') {
              o2.innerHTML = '<div class="wa-log wa-log-err">这不是本扩展的配置包（缺 worldaxis-config 信封）</div>';
              return;
            }
            // 试运行：直接调 importConfig 但**故意先注入一个必然拒收的条件**不可行（会掩盖真实校验），
            //   故改用「空 keys 探针 + 真实校验路径」两条并报：这里只做形状与键数的事实陈述。
            const ks = Object.keys(pre.keys || {}).length;
            const un = Object.keys(pre.unknown || {}).length;
            o2.innerHTML = '<div class="wa-log wa-log-warn">⚠ 即将导入 schema ' + esc(String(pre.schema))
              + ' 的配置包：已登记键 ' + ks + ' 个、未登记键 ' + un + ' 个。'
              + '写入前会自动留一份备份（导入前备份），写入是最后一步，任何校验不通过都不会改动当前配置。</div>'
              + '<div class="wa-row"><button class="wa-btn wa-mini" id="wa-cfg-go">确认导入</button>'
              + '<button class="wa-btn wa-mini" id="wa-cfg-abort">取消</button></div>';
            const go = $('#wa-cfg-go');
            if (go) go.onclick = async () => {
              let r = null;
              try { r = await WA.settingsBus.importConfig(txt); }
              catch (e4) { r = { ok: false, code: 'threw', detail: String(e4 && e4.message) }; }
              const o3 = $('#wa-diag-out');
              if (!o3) return;
              if (r.ok) {
                renderBody();
                const o4 = $('#wa-diag-out');
                if (o4) o4.innerHTML = '<div class="wa-log wa-log-info">✓ 配置包已导入：写入 ' + r.applied
                  + ' 个键 · 迁移 ' + (r.migrated ? r.migrated.length : 0) + ' 个'
                  + (r.skippedUnknownKeys && r.skippedUnknownKeys.length ? ' · 跳过未登记键 ' + r.skippedUnknownKeys.length + ' 个' : '')
                  + ' · 导入前备份 ' + esc(String(r.backup || '')) + '</div>';
              } else {
                o3.innerHTML = '<div class="wa-log wa-log-err">✗ 导入被拒（当前配置未被改动）：' + esc(String(r.code))
                  + (r.detail ? '（' + esc(String(r.detail).slice(0, 120)) + '）' : '') + '</div>';
              }
            };
            const ab = $('#wa-cfg-abort');
            if (ab) ab.onclick = () => { if (cfgBtn.onclick) cfgBtn.onclick(); };
          };
          const cc2 = $('#wa-cfg-cancel');
          if (cc2) cc2.onclick = () => { if (cfgBtn.onclick) cfgBtn.onclick(); };
        };
      } catch (e) { out.textContent = '配置包读取失败：' + (e && e.message); }
    };
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
              .map(function (k) { return ({ guarded: '删完仍在', missing: '登记项缺 key', setItem: '删除被拒', quarantine: '隔离路径', legacy: '旧键迁移', settings: '设置键出口', verifyBack: '写后/删后复核读回', permission: '无 delete 位被拦' }[k] || k) + '×' + byR[k]; }).join('、');
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
            uninjectLedger: '撤销账本', eventLog: '事件日志', errorLog: '错误日志',
            // v2.108.0 (plan-1 #18): 与 store.LAB / toolDiag.SRC_LABEL 同源同键集（三份真源一同登记）
            recoverBak: '后备存档读回',
            // v2.114.0：审计落盘面两处读失败来源（core/audit-log.js 投递）。
            //   三份真源缺一份，那一份的消费端就退回裸桶名——面板这格是「历史读不到」时
            //   用户唯一能看见的读数，裸桶名等于没有归因。
            auditlogFlush: '审计日志落盘前的历史读回',
            auditlogRestore: '审计日志历史读回',
            // v2.132.0（O19）: 与 store.LAB / toolDiag.SRC_LABEL 同源同键集（三份真源一同登记）。
            //   面板这格是「游标读不出来」时用户唯一能看见的读数——裸桶名等于没有归因，
            //   而 life 读失败时刻意不回落（如实答「本轮从 0 开始」），无标签时两件事同形。
            lifeTurn: '跨会话轮转游标读回',
            // v2.156.0（SP1）：与 store.LAB / toolDiag.SRC_LABEL 同源同键集（三份真源一同登记）。
            playtime: '游玩活动基准读回',
            tapeStore: '磁带仓库读回' };
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
    // v2.90.0 O3：本轮执行解释。两枚按钮各自报一面——
    //   玩家面只有“进了什么 + 还有几项没进”；全知面才有逐源名与归因码。
    //   两者不合并到一个输出框：合并就等于把制作者视图泄给玩家。
    const explainOut = (all) => {
      if (!WA.render || typeof WA.render.explain !== 'function') { setOut('#wa-inj-out', '本轮解释不可用（render.explain 未加载）。'); return; }
      const ex = WA.render.explain();
      if (!ex || !ex.ok) {
        const why = (ex && ex.reason) || 'unavailable';
        const hint = why === 'no-rotation' ? '尚无轮次记录——先推演一轮。'
          : (why === 'round-not-recorded' ? ('该轮次无记录（要 ' + ex.want + ' / 有 ' + ex.have + '）——不拿上一轮的当这一轮。') : '解释未可用。');
        setOut('#wa-inj-out', hint + '（' + why + '）');
        return;
      }
      if (!all) {
        const p = ex.player;
        setOut('#wa-inj-out', '第 ' + ex.round + ' 轮：' + p.summary + '。' + p.note);
        return;
      }
      const om = ex.omniscient;
      const lines = ['第 ' + om.round + ' 轮（' + _msTs(om.at) + '）：候选 ' + om.candidates + ' / 落地 ' + om.landedCount + ' / 未落地 ' + om.missedCount];
      om.decisions.forEach((d) => { lines.push('  · ' + d.name + '：' + d.state); });
      if (om.budget) {
        lines.push('预算 ' + om.budget.used + '/' + om.budget.cap + 't' + (om.budget.overBudget ? '（超）' : '') + '｜折叠 ' + om.budget.folded + ' / 丢弃 ' + om.budget.dropped);
        // v2.122.0 P2：折叠 / 丢弃下到**逐项**——「哪条挤掉了哪条」第一次在解释面上可读。
        //   计数答「挤掉几条」；明细答「裁决那刻还剩多少余量、预算正被谁占着」。
        //   只挂全知面（`all` 分支先前已 return）：玩家面不列未落地项的名字，本段一处也不进玩家分支。
        const occText = function (arr) {
          if (!arr || !arr.length) return '无占位';
          const shown = arr.slice(0, 6).map(function (oc) { return oc.source + '(' + oc.tokens + 't)'; }).join('、');
          return '被占：' + shown + (arr.length > 6 ? '…等 ' + arr.length + ' 项' : '');
        };
        (om.budget.foldedDetail || []).forEach(function (fd) {
          lines.push('  · [折叠] ' + fd.source + '：' + (fd.reason || '') + '（' + fd.from + '→' + fd.to + 't）｜裁决时余量 ' + (fd.remainAt == null ? '?' : fd.remainAt) + 't｜' + occText(fd.blockedBy));
        });
        (om.budget.droppedDetail || []).forEach(function (dd) {
          lines.push('  · [丢弃] ' + dd.source + '：' + (dd.reason || '') + '（' + dd.tokens + 't）｜裁决时余量 ' + (dd.remainAt == null ? '?' : dd.remainAt) + 't｜' + occText(dd.blockedBy));
        });
        // v2.122.0 P2：**块级出口**。上面两串按源名挂，而 `decisions` 只覆盖源表内的键——
        //   「世界状态」这类**块名**（六个快照源合成的一块）挂不上任何一行，于是它被折叠时
        //   在上面的输出里凭空消失，而它恰恰是 pinned 里最常被折的那一个。
        //   这里把挂不上源键的记录补报出来，并明说「无对应源键」——不让读的人以为
        //   「上面没有就是没发生」。
        (om.budget.unmappedDetail || []).forEach(function (ud) {
          const head = ud.kind === 'folded' ? '[折叠·块] ' : '[丢弃·块] ';
          const size = ud.kind === 'folded' ? (ud.from + '→' + ud.to + 't') : (ud.tokens + 't');
          lines.push('  · ' + head + ud.source + '：' + (ud.reason || '') + '（' + size + '）｜裁决时余量 '
            + (ud.remainAt == null ? '?' : ud.remainAt) + 't｜' + occText(ud.blockedBy)
            + '｜该名不在源表内（合成块，无对应源键）');
        });
      }
      if (om.cost) lines.push('耗时 ' + om.cost.totalMs + 'ms｜' + om.cost.measured + ' 源可计' + (om.cost.slowest ? '｜最慢 ' + om.cost.slowest.source + ' ' + om.cost.slowest.ms + 'ms' : ''));
      setOut('#wa-inj-out', lines.join('\n'));
    };
    on('#wa-inj-explain', () => { explainOut(false); });
    on('#wa-inj-explain-all', () => { explainOut(true); });
    // v2.91.0 O4：**开关两面真值**单独一个入口。
    //   为什么不能只放在诊断里：`mod-off` 是「用户勾着却完全无效」——它必须发生在
    //   用户自己点得到的地方，否则他会一路去改世界内容，而那个源根本没被调用过。
    //   只列 mod-off：on / unavailable 是常态，全列出来等于把这条读数淹掉。
    on('#wa-inj-face', () => {
      const stat = (WA.render && typeof WA.render.visibilityStat === 'function') ? WA.render.visibilityStat() : null;
      const audit = (stat && Array.isArray(stat.faceAudit)) ? stat.faceAudit : [];
      const off = audit.filter((r) => r.face === 'mod-off');
      const un = audit.filter((r) => r.face === 'unavailable');
      if (!off.length) {
        setOut('#wa-inj-out', '开关两面一致：没有任何源处于「勾着却无效」。'
          + '（' + audit.length + ' 个源中，' + un.length + ' 个没有模块级总开关，由世界数据直供）');
        return;
      }
      setOut('#wa-inj-out', '勾着却无效（模块总开关关着，共 ' + off.length + ' 个）：\n'
        + off.map((r) => '  · ' + r.name + '（' + r.key + '）—— ' + r.note).join('\n')
        + '\n这些源本轮一个字节都不会进正文；要让它们生效请开对应模块。');
    });
    // ── v2.150.0(RP4)：注入价值。三枚控件 + 一枚只读出口，与引擎的读/写两口逐一对应 ——
    //   只加控件不加 handler = 点了没反应；只加 handler 不加控件 = 死代码（与 sediment 同规）。
    //   阈值/上限走**同一个写口** setSettings（settingsBus.saveOrThrow：写后读回校验、失败分桶），
    //   故这里按返回的 r.ok 如实报「未落盘」——不吞掉写失败（吞了就成了「点了像成功」）。
    const ivWrite = function (patch) {
      if (!WA.injectValue || !WA.injectValue.setSettings) return '未落盘：module-missing';
      let r = null;
      try { r = WA.injectValue.setSettings(patch); } catch (e) { return '未落盘：' + String((e && e.message) || e); }
      if (!r || r.ok !== true) return '未落盘：' + ((r && r.reason) || 'write-failed');
      const cfg = WA.injectValue.getSettings();
      return '已落盘：零引用阈值 ' + cfg.zeroRefRounds + ' 轮 · 片段上限 ' + cfg.maxKeys + (cfg.enabled ? '（评估开）' : '（评估关）');
    };
    const ivRows = function (rep) {
      if (!rep || !rep.ok) return '（读数不可用：' + ((rep && rep.reason) || 'unknown') + '）';
      if (!rep.rows.length) return '还没有已结算的轮次（读数空不等于「都没用上」）。';
      const lines = ['已结算 ' + rep.rounds + '/' + rep.cap + ' 轮｜标注阈值 ' + rep.zeroRefRounds + ' 轮连续零引用'];
      if (rep.flagged.length) lines.push('该处置（连续零引用）：' + rep.flagged.join('、'));
      rep.rows.forEach(function (r) {
        lines.push('  · ' + r.source + '：独有引用 ' + (r.refDistinctAvg == null ? '无读数' : r.refDistinctAvg + ' 处/轮')
          + '｜采纳 ' + (r.adoptAvg == null ? '无读数' : r.adoptAvg + ' 条/轮')
          + '｜连击 ' + r.zeroStreak + ' 轮｜判定 ' + r.rounds + ' 轮（最近第 ' + r.lastRound + ' 轮）'
          + (r.code ? '｜' + r.code : ''));
      });
      if (rep.note) lines.push(rep.note);
      return lines.join('\n');
    };
    on('#wa-iv-refresh', () => {
      const rep = (WA.injectValue && WA.injectValue.report) ? WA.injectValue.report() : null;
      setOut('#wa-inj-out', ivRows(rep));
    });
    { const el = $('#wa-iv-enabled');
      if (el) el.onchange = function () { setOut('#wa-inj-out', ivWrite({ enabled: !!el.checked })); }; }
    { const el = $('#wa-iv-zero');
      if (el) el.onchange = function () { setOut('#wa-inj-out', ivWrite({ zeroRefRounds: Number(el.value) })); }; }
    { const el = $('#wa-iv-max');
      if (el) el.onchange = function () { setOut('#wa-inj-out', ivWrite({ maxKeys: Number(el.value) })); }; }
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
      // v2.137.0（O14）：`querySelectorAll` 返回 **NodeList**（有 forEach、**没有 filter**）。
      //   本行原写 `.filter(...)` —— 在 mini-DOM 里能过是因为替身的 `qsa()` 返回的是**普通数组**，
      //   而真浏览器里这条链一律抛 `TypeError: ...querySelectorAll(...).filter is not a function`，
      //   于是「注入诊断」按钮（把用户送到工具页并点「跑诊断」的那一枚）在真机上**点了没反应**。
      //   这不是排版问题，是控件功能整体不可达 —— 而它此前从未被任何门禁看见：
      //   mini-DOM 的数组返回值把该形态**结构性隐身**了（同族：v2.40.0 的陈旧常量、v2.42.0 的副本清单）。
      //   处置：改 `Array.prototype.filter.call`（对数组与 NodeList 同时成立，不依赖调用面类型），
      //   并把该形态升格成检测面（tests/ui-live-v2137.js 的静态锁）—— 形态本身从此有人守。
      const toolTab = Array.prototype.filter.call(panelEl.querySelectorAll('.wa-tab'),
        t => t.dataset.page === 'tools')[0];
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
      <div class="wa-head"><span class="wa-title">◈ 世界枢轴 <span class="wa-ver">v${WA.version}</span></span><span class="wa-view">${(() => {
        // ── v2.149.0（P3）：观测视角选择器（面板顶部常驻）──
        //   为什么常驻头部而不放进某一页：视角回答「这个面板给谁看」，它属于面板而不是任何
        //   一页 —— 放进页里，切页后选择器消失，用户会以为它没生效。
        //   与「视角锁」区（wa-per-*）严格分开：那个管**正文该怎么写**（叙事视角），
        //   这个管**面板给谁看**（观测视角）。合成一个会让「作者想这么写」与
        //   「玩家该看到这个吗」互相冒充（引擎侧同一条边界，见 perspective-lock 的 VIEWS）。
        //   选项表取自引擎 VIEWS 单一真源 —— 面板不自带第二份视角清单（自造视角等于自造判定）。
        //   模块缺席时如实说缺，不给一个点了没反应的下拉。
        const pv = WA.perspective;
        if (!pv || !pv.setView) return '<span class="wa-dim">观测视角：模块未装载</span>';
        const views = pv.VIEWS || [];
        // 读当前档走**全名** `WA.perspective.getView`（不是上面那个别名 pv.getView）：
        //   清册的引用面只认 `WA.<ns>.<mem>` 形态，别名调用让「这个导出有没有人用」在
        //   死导出门禁里看不见 —— getView 会被判成 self-only 过度导出（v2.149.0 实测）。
        //   别名本身保留（views/setView 两处照旧），只是当前档这一口必须留下可数的引用。
        const cur = (typeof WA.perspective.getView === 'function') ? WA.perspective.getView().view : '';
        const vn = function (v) { return v === 'player' ? '玩家视角' : (v === 'omniscient' ? '全知视角' : v); };
        return '<select id="wa-view-sel" class="wa-input wa-viewsel" aria-label="观测视角（面板给谁看）">'
          + views.map(function (v) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + esc(vn(v)) + '</option>'; }).join('')
          + '</select><span id="wa-view-out" class="wa-dim"></span>';
      })()}</span><span class="wa-close">✕</span></div>
      <div class="wa-tabs">${PAGES.map(p => `<button class="wa-tab" data-page="${p.id}">${p.icon} ${p.label}</button>`).join('')}</div>
      <div class="wa-body"></div>
    </div>`);
    mainDoc.body.appendChild(panelEl);
    panelEl.querySelector('.wa-close').onclick = () => toggle(false);
    // v2.149.0（P3）：观测视角选择器。**绑定在 buildPanel 里而不是 bindBody 里** ——
    //   它在 wa-head 上，而 wa-head 不参与 renderBody 的整块重建（面板头只建一次）。
    //   放进 bindBody 的后果是：每次重绘都重新绑一次，且重绘后选择器节点已不在
    //   重建范围内（重复绑定 + 每次重绘丢焦点，用户拖一下就被打断）。
    (function () {
      const sel = panelEl.querySelector('#wa-view-sel');
      if (!sel) return;
      sel.onchange = function () {
        const out = panelEl.querySelector('#wa-view-out');
        const set = function (t) { if (out) out.textContent = t; };
        if (!WA.perspective || typeof WA.perspective.setView !== 'function') return set('未记录：module-missing');
        const r = WA.perspective.setView(sel.value);
        // 两态严格分开：ok:false 是「没记上」（表外值），ok:true 才是本体
        //   （changed:false 是「本来就是这一档」——那不是失败，是幂等）。
        if (!r.ok) { set('未记录：' + (r.reason || '未知原因') + (r.allowed ? '（可选：' + r.allowed.join('/') + '）' : '')); return; }
        set(r.changed ? ('已切到 ' + r.to + '（重绘后过滤生效）') : ('本来就是 ' + r.to));
        if (WA.log) WA.log('info', '观测视角：' + r.from + ' → ' + r.to);
        renderBody();
      };
    })();
    // v2.109.0（#15）：切页即落盘（走 __persistPanel 的单一写路径）——点同一页也写一次：
    //   saveOrThrow 内含写后读回校验，重复写同值不产生副作用，却能让「落盘能力断了」
    //   这件事**在第一次点击时就暴露**，而不是等到用户下次重载才发现视图状态没了。
    panelEl.querySelectorAll('.wa-tab').forEach(t => t.onclick = () => { currentPage = t.dataset.page; syncTabs(); renderBody(); __persistPanel(); });
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
