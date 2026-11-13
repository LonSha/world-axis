/**
 * WorldAxis ui/pages/overview-main.js (2.401.0) — 概览页主线（OPV23-1，原 ui/panel.js 563-1155 行）
 *
 * ── 它治什么 ────────────────────────────────────────────────────
 *   `ui/panel.js` 拆前 17577 行（重组面）/ 17132 行（文件面）。`renderOverview` 一段
 *   593 行独占 3.5%，是单文件里最长的一个函数：6 个统计格 + 11 个主流程块
 *   （firstBlock / diary / brief / intel-network / intent / route / temp / cal /
 *   cost / save）+ 3 个 `__dashboardBlock` 大盘 + 7 个全知块 + 工作流开关。
 *
 * ── 口径（三条，全部否定式）──────────────────────────────────────
 *   1 **零世界写**：本段只读 `WA.*` 的既有读口，零 transact、零 draft 赋值。
 *   2 **零模块作用域**：顶层零 `require`、零 `module.exports` —— ui/*.js 全部由
 *      `vm.runInContext` 装载，与 ui/panel-nav.js / panel-fold.js / overview-blocks.js
 *      同一契约（自挂 `WA.<ns>`）。
 *   3 **外部依赖只走注入**：段体用到的 8 个外部符号（`esc` + 七个只读块转发）由
 *      ui/panel.js 在**调用时**经 `bind({...})` 注入。绝不在此复制一份实现
 *      —— 那会让转义/读数出现第二份真源。
 *
 * ── 缺席兜底 ────────────────────────────────────────────────────
 *   未 bind 时 `esc` 兜底成恒等（可见的裸 `<`，而不是静默看起来正常），
 *   七个块兜底成空串（与 ui/pages/overview-blocks.js 同一条纪律：缺席好于假值）。
 *   为什么不复制一份 esc：v2.111.0 已把转义收到 core/sanitize.js 单一真源上。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  let esc = function (s) { return String(s == null ? '' : s); };
  let evictBlock = function () { return ''; };
  let randBlock = function () { return ''; };
  let clockBlock = function () { return ''; };
  let bridgeBlock = function () { return ''; };
  let lonshaBlock = function () { return ''; };
  let heartbeatBlock = function () { return ''; };
  let v22OmensBlock = function () { return ''; };
  /**
   * 注入外部符号。**幂等**；返回 API 本身，便于链式调用。
   *   只接受函数形态的注入 —— 传进来一个非函数就等于没接上，此处不静默兜住。
   */
  function bind(ctx) {
    if (!ctx) return API;
    if (typeof ctx.esc === 'function') esc = ctx.esc;
    if (typeof ctx.evictBlock === 'function') evictBlock = ctx.evictBlock;
    if (typeof ctx.randBlock === 'function') randBlock = ctx.randBlock;
    if (typeof ctx.clockBlock === 'function') clockBlock = ctx.clockBlock;
    if (typeof ctx.bridgeBlock === 'function') bridgeBlock = ctx.bridgeBlock;
    if (typeof ctx.lonshaBlock === 'function') lonshaBlock = ctx.lonshaBlock;
    if (typeof ctx.heartbeatBlock === 'function') heartbeatBlock = ctx.heartbeatBlock;
    if (typeof ctx.v22OmensBlock === 'function') v22OmensBlock = ctx.v22OmensBlock;
    return API;
  }
  // ══ 段体开始（原 ui/panel.js 563-1155 行，逐字搬迁，一个字符未改）══
  function renderOverview() {
    const s = WA.store.get();
    const nodes = WA.workflow.list();
    const beforeN = nodes.filter(n => n.chain === 'before').length, afterN = nodes.filter(n => n.chain === 'after').length;
    // v2.257.0（V6 OPV6-2）：启用面摘要行 —— 玩家第一屏就要答出「世界到底跑起来了吗」。
    //   三条口径：
    //   ① **只念引擎原话**：整句取自 `capabilityAudit.summary().line`，面板不自己拼措辞
    //      （同一句话在诊断节与设置页也是这一份，另编一份就是第二个措辞真源）。
    //   ② **「读不到」与「关着」分开**：引擎缺席时明写「读数不可用」，不渲染成「世界只跑了最基础的部分」
    //      —— 后者会让玩家以为「本来就该这样」，而实际上是一整块能力没装上。
    //   ③ **玩家关掉的显示开关要算数**：`showSummary:false` 就整行不出现（玩家说不看就不看），
    //      但诊断节与机制页的读数不受此影响 —— 那是诊断面，不是玩家面。
    const capLine = (function () {
      try {
        if (!WA.capabilityAudit || typeof WA.capabilityAudit.summary !== 'function') {
          return '<div class="wa-dim" id="wa-cap-line">世界规模读数不可用（engines/capability-audit.js 缺席）</div>';
        }
        const sm = WA.capabilityAudit.summary();
        if (!sm || sm.ok === false) return '<div class="wa-dim" id="wa-cap-line">世界规模读数失败（summary() 未返回）</div>';
        if (sm.showSummary !== true) return '';
        // 用纯文本节点承载整句（不把数字包进 <b>）：这段读数会被 ui-gate 与专锁按
        //   textContent 比对，标签内嵌数值在不同序列化实现下会漂位置（本版真踩过一次）。
        const extra = sm.userOff > 0
          ? '（其中 ' + sm.userOff + ' 项是你自己关掉的，不算欠账）'
          : '';
        return '<div class="wa-dim" id="wa-cap-line">' + esc(sm.line) + ' —— 共 ' + sm.mechanisms
          + ' 项世界机制，' + (sm.mechanisms - sm.running) + ' 项没开' + extra
          + '。到「设置」页顶部一键调整。</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-cap-line">世界规模读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.280.0（V7 OPV7-4）：写口契约自述行 —— 「有多少写口拒了会说清下一步」。
    //   三条口径（与 capLine / healthLine 同规）：
    //   ① **只在值得说的时候说**：`withHint === 0` 就整行不出现（这是提示，不是装饰）；
    //   ② **不冒充扫完**：`truncated` 时必须带「下界」二字 —— 截断后的数字不是全量；
    //   ③ **措辞只此一份**：整句来自 `summaryText()`，面板不自己拼（第二个措辞真源 = 漂移源）。
    //   为什么玩家面要有这一行：它是「这个世界的机制彼此之间讲不讲得通道理」的可见证据。
    //   95 个写口写了下一步、其余一千多个没写 —— 玩家看不到这件事，就只能靠报错猜。
    const wcLine = (function () {
      try {
        if (!WA.writeContract || typeof WA.writeContract.summaryText !== 'function') return '';
        const st = (typeof WA.writeContract.stat === 'function') ? WA.writeContract.stat() : {};
        if (!st || !(Number(st.withHint) > 0)) return '';
        return '<div class="wa-dim" id="wa-wc-line">' + esc(WA.writeContract.summaryText()) + '</div>';
      } catch (e) {
        return '';   // 提示行不占屏的失败方式：静默不显示，不把异常砸到玩家面上
      }
    })();
    // v2.259.0（V6 OPV6-4）：首轮体检块 —— 「世界跑起来了，但内容只出来一部分」要说得出为什么。
    //   三条口径（与 capLine 同规）：
    //   ① **整句取自引擎原话**：`threeGatesLine()` 一句到底，面板不拼措辞（第二个措辞真源就是漂移源）。
    //   ② **「读不到」与「都通」分开**：引擎缺席时写「体检读数不可用」，不渲染成「三道门槛都通」
    //      —— 后者会让玩家以为世界健康，而实际上是一整块自检没装上。
    //   ③ **通过时不占屏**：verdict 为 running 就整块不出现（没毛病就不打扰），
    //      有问题才显示 —— 这是体检块，不是装饰块。
    const healthLine = (function () {
      try {
        if (!WA.healthPreflight || typeof WA.healthPreflight.threeGatesLine !== 'function') {
          return '<div class="wa-dim" id="wa-health-line">体检读数不可用（engines/health-preflight.js 缺席）</div>';
        }
        const r = WA.healthPreflight.threeGates({ sample: 8 });
        // v2.278.0（V7 OPV7-2）：consume 五态。dormant 必须占屏 —— 它是「世界看着在转、
        //   一部分机制从来没被喂过」的唯一出口；把它跟 running 一起静默，玩家永远不会知道。
        // v2.279.0（V7 OPV7-3）：产出面（yield）同理 —— 「这一轮世界一个字没说」
        //   是玩家最该当场知道的事，它绝不能跟 running 一起静默。
        if (!r || r.verdict === 'running') return '';
        // 纯文本节点承载整句：ui-gate 与专锁按 textContent 比对，标签内嵌数值会漂位置（capLine 踩过）。
        return '<div class="wa-dim" id="wa-health-line">' + esc(WA.healthPreflight.threeGatesLine({ sample: 8 }))
          + '。到「诊断」页的体检节看逐条读数。</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-health-line">体检读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.260.0（V6 OPV6-5）：缺省面提示行 —— 「引擎在跑、正文没内容」的第三类病因。
    //   三条口径：
    //   ① **只在「从未配置」时说**：`configured === true` 就是玩家自己配过，缺省不再背锅
    //      （此时若内容没出来，是玩家自己的选择或模块关着，另有 capLine/healthLine 在报）。
    //   ② **静默组合优先、且最重**：`silent > 0`（默认关 + 模块开着）才是真的「引擎在跑、
    //      内容不注入」，这一句必须单独成句；剩下 defaultOff 里那些「双重关/无开关」只作补充，
    //      因为它们本来就得先开模块，不构成「不该关却关着」。
    //   ③ **没毛病就整行不出现**：三桶全为零就返回空串（这是提示，不是装饰）。
    const visLine = (function () {
      try {
        if (!WA.render || typeof WA.render.visibilityDefault !== 'function') return '';
        const vd = WA.render.visibilityDefault();
        if (!vd || vd.configured === true) return '';
        const off = vd.defaultOff || [];
        if (!off.length) return '';
        const head = vd.silent > 0
          ? '有 ' + vd.silent + ' 个源默认关着、而它们的模块总开关是开着的（' + (vd.silentKeys || []).join('、')
            + '）—— 引擎在跑，这部分内容不会进正文。'
          : '注入源可见性从未配置过：' + vd.sources + ' 个源全走出厂缺省。';
        const tail = vd.silent > 0
          ? ''
          : '其中 ' + off.length + ' 个默认关（' + off.join('、') + '），默认关不等于你用不上。';
        return '<div class="wa-dim" id="wa-vis-line">' + esc(head + tail)
          + '到「设置」页的注入可见性一格逐项打开。</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-vis-line">注入源缺省读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.263.0（V6 OPV6-8）：首局体检结论块 —— 「所以这一局到底跑起来了没有」。
    //   与上面三条并列行（capLine / healthLine / visLine）的分工必须说清：
    //   那三条各答一面（机制够不够 / 门槛过没过 / 缺省该不该改），**都是诊断面语言**；
    //   本块答的是把三面压成一句之后的那个结论，**是玩家面语言**，故排在最前。
    //   三条口径（与 capLine 同规）：
    //   ① **整句取自引擎原话**：`firstRunLine()` 一句到底，面板不拼措辞；
    //   ② **unknown 不折叠成 running**：读不到时明写「读不到」，绝不渲染成「正在运转」；
    //   ③ **running 也显示**：这是首局体检，玩家第一次打开就该看到「跑起来了」这句话 ——
    //      与 healthLine（通过时不占屏）取舍相反，因为那一块是告警，这一块是结论。
    const firstLine = (function () {
      try {
        if (!WA.healthPreflight || typeof WA.healthPreflight.firstRunLine !== 'function') {
          return '<div class="wa-dim" id="wa-first-line">首局体检读数不可用（engines/health-preflight.js 缺席）</div>';
        }
        const fv = WA.healthPreflight.firstRunView({ sample: 0 });
        // 四态各带一个稳定 class：专锁与 ui-gate 按 class 判「这一刻是哪个结论」，
        //   不按文字判（文字会改，class 是契约）。
        return '<div class="wa-dim wa-first wa-first-' + esc(fv.state) + '" id="wa-first-line">'
          + esc(WA.healthPreflight.firstRunLine({ sample: 0 })) + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-first-line">首局体检读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.265.0（V6 EXV6-1）：世界日记 —— 「你看不见的地方发生了什么」。
    //   与上面四条并列行（firstLine / capLine / healthLine / visLine）的分工必须说清：
    //   那四条答的都是「这套机制跑没跑起来」（诊断面语言），本块答的是「世界这一刻发生过什么」
    //   （玩家面语言，正文的补充读物）—— 混排会让概览页变成两张不同语言的清单。
    //   三条口径：
    //   ① **整句取自引擎原话**：句子由 `worldDiary.build()` 压好，面板只做转义与排版，
    //      不自己拼措辞（另拼一份就是第二个措辞真源，与 capLine 同规）。
    //   ② **「读不到」与「没有事」必须分开**：引擎缺席写「读数不可用」，空态写「不是「没读到」」
    //      —— 后者是**确实没有**，前者是**没装上**；两者在玩家眼里同形，处置却一个是等、一个是修。
    //   ③ **不打扰**：关闭时只留一行「已关闭」，不出占位空块；quiet 时也只有一句话，不铺留白。
    const diaryBlock = (function () {
      try {
        if (!WA.worldDiary || typeof WA.worldDiary.build !== 'function') {
          return '<div class="wa-dim" id="wa-diary-block">世界日记读数不可用（engines/world-diary.js 缺席）</div>';
        }
        const cfg = (typeof WA.worldDiary.getSettings === 'function') ? WA.worldDiary.getSettings() : null;
        if (!cfg || cfg.enabled !== true) {
          return '<div class="wa-dim" id="wa-diary-block">世界日记已关闭（在设置页的「世界日记」一格打开）</div>';
        }
        const r = WA.worldDiary.build();
        if (!r || r.ok !== true) {
          return '<div class="wa-dim" id="wa-diary-block">世界日记读数失败（build() 未返回）</div>';
        }
        // 稳定 class 承载「这一刻是哪个态」：专锁按 class 判，不按文字判（文字会改，class 是契约）。
        if (r.quiet === true) {
          return '<div class="wa-diary wa-diary-quiet" id="wa-diary-block"><div class="wa-dim">'
            + esc(r.hint || '这几轮镜头外没有需要你知道的事') + '</div></div>';
        }
        const lines = Array.isArray(r.lines) ? r.lines : [];
        return '<div class="wa-diary wa-diary-live" id="wa-diary-block">'
          + lines.map(function (l) { return '<div class="wa-diary-line">' + esc(l) + '</div>'; }).join('')
          + (r.truncated
            ? '<div class="wa-dim">另有 ' + esc(String(r.dropped)) + ' 条没展开（本屏上限 ' + esc(String(r.cap)) + ' 句）</div>'
            : '')
          + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-diary-block">世界日记读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.266.0（V6 EXV6-2）：人物今日动线 —— 「NPC 的一天看得见」。
    //   与上面 diaryBlock 的分工：日记答「镜头外发生过什么」（过去、多来源合流），
    //   动线答「这几个人今天在哪、做了什么、接下来干嘛」（现在、按人分栏）。
    //   两块都是玩家面语言，故并列排在一起；与 firstLine/capLine/healthLine/visLine
    //   那四条诊断面语言的行**必须分开**（混排会让概览页变成两张不同语言的清单）。
    //   四条口径（与 diaryBlock 同规，新出口上不再重犯）：
    //   ① **整句取自引擎**：面板只转义与排版，不自己拼措辞；
    //   ② **三种零读数分开**：模块缺席 / 关着 / 没人可读 —— 各自不同因、各自不同处置；
    //   ③ **`unreadable` 不占位**：读了但判不了的段由引擎拼句时丢弃，面板不补「（无）」；
    //   ④ **不打扰**：quiet 只有一句话，不出空块。
    const routeBlock = (function () {
      try {
        if (!WA.dayRoute || typeof WA.dayRoute.build !== 'function') {
          return '<div class="wa-dim" id="wa-route-block">人物动线读数不可用（engines/day-route.js 缺席）</div>';
        }
        const cfg = (typeof WA.dayRoute.getSettings === 'function') ? WA.dayRoute.getSettings() : null;
        if (!cfg || cfg.enabled !== true) {
          return '<div class="wa-dim" id="wa-route-block">人物动线已关闭（在设置页的「人物动线」一格打开）</div>';
        }
        const r = WA.dayRoute.build();
        if (!r || r.ok !== true) {
          return '<div class="wa-dim" id="wa-route-block">人物动线读数失败（build() 未返回）</div>';
        }
        // 稳定 class 承载「这一刻是哪个态」：专锁按 class 判，不按文字判。
        if (r.quiet === true) {
          // quiet 的两种因（没人可读 / 读了没依据）由引擎给 hint，面板只转义。
          return '<div class="wa-route wa-route-quiet" id="wa-route-block"><div class="wa-dim">'
            + esc(r.hint || '这几个人今天没有可读的动线') + '</div></div>';
        }
        const lines = Array.isArray(r.lines) ? r.lines : [];
        // 第几日放在同一个块头：动线的语义是「今天」，不给日子等于让玩家自己去别处对。
        const dayHead = (r.dayReadable === true && r.day !== null && r.day !== undefined)
          ? '<div class="wa-dim">第' + esc(String(r.day)) + '日的动线</div>'
          : '<div class="wa-dim">日子读不到（世界钟未设定）—— 下面几行仍按已记录的事实念</div>';
        return '<div class="wa-route wa-route-live" id="wa-route-block">'
          + dayHead
          + lines.map(function (l) { return '<div class="wa-route-line">' + esc(l) + '</div>'; }).join('')
          + (r.truncated
            ? '<div class="wa-dim">另有 ' + esc(String(r.dropped)) + ' 人没展开（本屏上限 ' + esc(String(r.cap)) + ' 人）</div>'
            : '')
          + '</div>';
      } catch (e) {
        return '<div class=\"wa-dim\" id=\"wa-route-block\">人物动线读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.267.0（V6 EXV6-3）：关系温度计 —— 「这段关系为什么变了」。
    const tempBlock = (function () {
      try {
        if (!WA.relationTemp || typeof WA.relationTemp.build !== 'function') {
          return '<div class=\"wa-dim\" id=\"wa-temp-block\">关系温度读数不可用（engines/relation-temp.js 缺席）</div>';
        }
        const cfg = (typeof WA.relationTemp.getSettings === 'function') ? WA.relationTemp.getSettings() : null;
        if (!cfg || cfg.enabled !== true) {
          return '<div class=\"wa-dim\" id=\"wa-temp-block\">关系温度计已关闭（在设置页的「关系温度计」一格打开）</div>';
        }
        const r = WA.relationTemp.build();
        if (!r || r.ok !== true) {
          return '<div class=\"wa-dim\" id=\"wa-temp-block\">关系温度读数失败（build() 未返回）</div>';
        }
        if (r.quiet === true) {
          return '<div class=\"wa-temp wa-temp-quiet\" id=\"wa-temp-block\"><div class=\"wa-dim\">'
            + esc(r.hint || '暂无记录在案的关系变化') + '</div></div>';
        }
        const lines = Array.isArray(r.lines) ? r.lines : [];
        return '<div class="wa-temp wa-temp-live" id="wa-temp-block">'
          + lines.map(function (l) { return '<div class="wa-temp-line">' + esc(l) + '</div>'; }).join('')
          + (r.truncated
            ? '<div class="wa-dim">另有 ' + esc(String(r.dropped)) + ' 人没展开（本屏上限 ' + esc(String(r.cap)) + ' 人）</div>'
            : '')
          + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-temp-block">关系温度读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.268.0（V6 EXV6-4）：暗流日历 —— 「未结算的事几时撞上」。
    const calBlock = (function () {
      try {
        if (!WA.undercurrentCalendar || typeof WA.undercurrentCalendar.build !== 'function') {
          return '<div class="wa-dim" id="wa-cal-block">暗流日历读数不可用（engines/undercurrent-calendar.js 缺席）</div>';
        }
        const cfg = (typeof WA.undercurrentCalendar.getSettings === 'function') ? WA.undercurrentCalendar.getSettings() : null;
        if (!cfg || cfg.enabled !== true) {
          return '<div class="wa-dim" id="wa-cal-block">暗流日历已关闭（在设置页的「暗流日历」一格打开）</div>';
        }
        const r = WA.undercurrentCalendar.build();
        if (!r || r.ok !== true) {
          return '<div class="wa-dim" id="wa-cal-block">暗流日历读数失败（build() 未返回）</div>';
        }
        if (r.totalActive === 0) {
          return '<div class="wa-cal wa-cal-quiet" id="wa-cal-block"><div class="wa-dim">未来三天未发现迫近的未结算暗流，局势相对平稳。</div></div>';
        }
        const items = Array.isArray(r.items) ? r.items : [];
        return '<div class="wa-cal wa-cal-live" id="wa-cal-block">'
          + '<div class="wa-cal-line" style="font-weight:600;margin-bottom:3px;">未来三天暗流日历（基准：' + esc((r.baseDay && r.baseDay.label) || '当前') + '）</div>'
          + items.map(function (it) {
              const dayTag = (it.etaDays === 0) ? '今日' : (it.etaDays === 1 ? '明日' : (it.etaDays === 2 ? '后日' : ('第' + it.targetDay + '日')));
              return '<div class="wa-cal-line">'
                + '<b>【' + esc(dayTag) + '·' + esc(it.urgencyName) + '】</b>'
                + esc(it.title)
                + ' <span class="wa-dim">（窗口:' + esc(it.turns) + ' · ' + esc(it.windowText) + '）</span>'
                + '</div>';
            }).join('')
          + (r.overflowCount > 0 ? '<div class="wa-dim">另有 ' + esc(String(r.overflowCount)) + ' 条远期暗流推进中</div>' : '')
          + (r.shieldedHiddenCount > 0 ? '<div class="wa-dim">（含 ' + esc(String(r.shieldedHiddenCount)) + ' 条隐秘异动保护）</div>' : '')
          + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-cal-block">暗流日历读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.269.0（V6 EXV6-5）：单轮成本卡 —— 「这一轮我花了多少上下文、哪几条白花」。
    //   三态如实分列：关着 / 没有上一轮 / 有读数。**「没有上一轮」绝不许长得像「零成本」**，
    //   面板上那一格必须明说「还不是零成本」——本模块立项的全部意义就在这一句上。
    const costBlock = (function () {
      try {
        if (!WA.roundCost || typeof WA.roundCost.build !== 'function') {
          return '<div class="wa-dim" id="wa-cost-block">单轮成本读数不可用（engines/round-cost.js 缺席）</div>';
        }
        const cfg = (typeof WA.roundCost.getSettings === 'function') ? WA.roundCost.getSettings() : null;
        if (!cfg || cfg.enabled !== true) {
          return '<div class="wa-dim" id="wa-cost-block">单轮成本卡已关闭（在设置页的「单轮成本卡」一格打开）</div>';
        }
        const r = WA.roundCost.build();
        if (!r || (r.state !== 'live' && r.state !== 'empty')) {
          return '<div class="wa-cost wa-cost-quiet" id="wa-cost-block"><div class="wa-dim">'
            + esc((r && r.line) || '单轮成本读数失败（build() 未返回）') + '</div></div>';
        }
        if (r.state === 'empty') {
          return '<div class="wa-cost wa-cost-quiet" id="wa-cost-block"><div class="wa-dim">'
            + esc(r.line) + '</div></div>';
        }
        const b = r.board || {};
        return '<div class="wa-cost wa-cost-live" id="wa-cost-block">'
          + '<div class="wa-cost-line" style="font-weight:600;margin-bottom:3px;">本轮成本卡（第 ' + esc(String(r.round == null ? '?' : r.round)) + ' 轮）</div>'
          + '<div class="wa-cost-line">' + esc(r.line) + '</div>'
          + (r.modeText ? '<div class="wa-cost-line wa-dim">额度档位：' + esc(r.modeText) + '</div>' : '')
          + (b.stale > 0 ? '<div class="wa-cost-line wa-dim">另有 ' + esc(String(b.stale)) + ' 条更早轮次的源，不列入本轮统计</div>' : '')
          + (r.flaggedAll && r.flaggedAll.length
            ? '<div class="wa-cost-line wa-dim">连续零引用：' + esc(r.flaggedAll.slice(0, 6).join('、')) + '</div>' : '')
          + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-cost-block">单轮成本读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.270.0（V6 EXV6-6）：存档体检 —— 「这局还能跑多久 + 建议先做什么」。
    //   缺面必须看得见：三个上游出厂全关，体检单要明说「读不全（不等于健康）」，
    //   而不是给一个看着正常的「状况良好」——那是把没量到写成量出来很好。
    const saveBlock = (function () {
      try {
        if (!WA.saveHealth || typeof WA.saveHealth.build !== 'function') {
          return '<div class="wa-dim" id="wa-save-block">存档体检读数不可用（engines/save-health.js 缺席）</div>';
        }
        const cfg = (typeof WA.saveHealth.getSettings === 'function') ? WA.saveHealth.getSettings() : null;
        if (!cfg || cfg.enabled !== true) {
          return '<div class="wa-dim" id="wa-save-block">存档体检已关闭（在设置页的「存档体检」一格打开）</div>';
        }
        const r = WA.saveHealth.build();
        if (!r || (r.ok !== true && r.state !== 'no-data')) {
          return '<div class="wa-dim" id="wa-save-block">存档体检读数失败（build() 未返回）</div>';
        }
        if (r.state === 'no-data') {
          return '<div class="wa-save wa-save-quiet" id="wa-save-block"><div class="wa-dim">'
            + esc(r.line) + '</div></div>';
        }
        const cls = (r.state === 'urgent') ? 'wa-save wa-save-live wa-save-urgent'
          : (r.state === 'watch' ? 'wa-save wa-save-live wa-save-watch' : 'wa-save wa-save-live');
        const rows = (r.advice || []).map(function (x) {
          return '<div class="wa-save-line wa-dim">· ' + esc(x.text) + '</div>';
        }).join('');
        return '<div class="' + cls + '" id="wa-save-block">'
          + '<div class="wa-save-line" style="font-weight:600;margin-bottom:3px;">存档体检 · ' + esc(r.state) + '</div>'
          + '<div class="wa-save-line">' + esc(r.line) + '</div>'
          + rows
          + (r.adviceTotal > (r.advice || []).length
            ? '<div class="wa-save-line wa-dim">另有 ' + esc(String(r.adviceTotal - r.advice.length)) + ' 条建议未列出</div>' : '')
          + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-save-block">存档体检读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.271.0（V6 EXV6-7）：开局引导三步卡 —— 「你现在在第几步、下一步做什么」。
    //   三态如实渲染：done 划掉、todo 加粗、cannot-tell 斜体并说明**测不到**（不写成没做）。
    //   每步给一个直达按钮（出口来自引擎的 next()，面板不自己编动作）。
    const firstBlock = (function () {
      try {
        if (!WA.firstRun || typeof WA.firstRun.build !== 'function') {
          return '<div class="wa-dim" id="wa-first-block">开局引导不可用（engines/first-run.js 缺席）</div>';
        }
        const cfg = (typeof WA.firstRun.getSettings === 'function') ? WA.firstRun.getSettings() : null;
        if (!cfg || cfg.enabled !== true) return '';   // 关着就整块不渲染（不占屏）
        const r = WA.firstRun.build();
        if (!r || r.ok !== true) return '';
        if (r.visible !== true) return '';             // 三步都做完且未要求保留 ⇒ 不占屏
        const rows = (r.steps || []).map(function (s) {
          const cls = s.state === 'done' ? 'wa-first-done'
            : (s.state === 'cannot-tell' ? 'wa-first-cannot' : 'wa-first-todo');
          const mark = s.state === 'done' ? '✓' : (s.state === 'cannot-tell' ? '?' : '○');
          const note = s.state === 'cannot-tell'
            ? (' <span class="wa-dim">（测不到' + (s.why2 ? '：' + esc(s.why2) : '') + '，可手勾）</span>')
            : (s.source === 'manual' ? ' <span class="wa-dim">（你自己勾的）</span>' : '');
          return '<div class="wa-first-step ' + cls + '">'
            + '<b>' + esc(mark + ' ' + s.order + '. ' + s.title) + '</b>'
            + '<span class="wa-dim">' + esc(s.why) + '</span>'
            + note
            + '<button class="wa-btn wa-mini wa-first-go" data-first-go="' + esc(s.id) + '" title="' + esc(s.exit.hint) + '">去做</button>'
            + '</div>';
        }).join('');
        return '<div class="wa-first wa-first-live" id="wa-first-block">'
          + '<div class="wa-first-line" style="font-weight:600;margin-bottom:3px;">开局引导（' + esc(String(r.doneCount)) + '/' + esc(String(r.total)) + '）</div>'
          + rows
          + '<div class="wa-first-line wa-dim">' + esc(r.line) + '</div>'
          // v2.274.0：dismiss 的真消费方。用 data-* 而非 id 绑：本块是**条件渲染**
          //   （visible 才出），进 UI_BINDINGS 的静态 id 表会被判成「静态渲染缺失」。
          + '<button class="wa-btn wa-mini wa-first-dismiss" data-first-dismiss="1" title="收起这一块（只写设置族，不动世界）：三步的当前态在设置页「开局引导」一格仍然查得到">知道了</button>'
          + '<div id="wa-first-out" class="wa-out"></div>'
          + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-first-block">开局引导读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.285.0（V7 EXV7-1）：今日世界简报 —— 「这一轮结构化引擎各自吃进了几笔」。
    //   与上面各玩家面块（diaryBlock / routeBlock / tempBlock）的分工：那些答「世界里
    //   发生过什么」（叙事面），本块答「这一轮机制各消化了几笔」（流水面）。盯系统的人
    //   看的就是它。四条口径与 diaryBlock 同规（整句取自引擎 / 三态零读数分开 / 关着不占
    //   屏 / quiet 一句话）+ 一条本块特有的：**核对不到的行不渲染**（引擎缺席或 stat 缺键
    //   的源，一行都不出，不补「（无）」）。
    const briefBlock = (function () {
      try {
        if (!WA.worldBriefing || typeof WA.worldBriefing.view !== 'function') {
          return '<div class="wa-dim" id="wa-brief-block">世界简报读数不可用（engines/world-briefing.js 缺席）</div>';
        }
        const cfg = (typeof WA.worldBriefing.getSettings === 'function') ? WA.worldBriefing.getSettings() : null;
        if (!cfg || cfg.enabled !== true) return '';   // 关着就整块不渲染（同 firstBlock 口径）
        const v = WA.worldBriefing.view();
        if (!v || v.available !== true) {
          // 还没结算过：这是正常态（新开局），一句话说明，不冒充「零流水」
          return '<div class="wa-dim" id="wa-brief-block">世界简报还没生成（每轮世界结算后更新一次）</div>';
        }
        const rows = (v.rows || []).filter(function (r) { return r.now !== null; });
        if (!rows.length) {
          return '<div class="wa-dim" id="wa-brief-block">世界简报：六源全部核对不到（引擎未加载）</div>';
        }
        if (v.firstRound === true) {
          return '<div class="wa-brief wa-brief-live" id="wa-brief-block">'
            + '<div class="wa-brief-line" style="font-weight:600;margin-bottom:3px;">今日世界简报（第 1 轮 · 基线建立）</div>'
            + '<div class="wa-dim">开局第一轮只建立基线，不报流水 —— 播种存量的数字会在下一轮的差分里出现。</div>'
            + '</div>';
        }
        const lineTxt = function (r) {
          const d = (r.delta === null) ? '—' : ('+' + r.delta);
          const state = r.on === false ? ' <span class="wa-dim">（引擎关着）</span>' : '';
          return '<div class="wa-brief-line">' + esc(r.label) + '：' + esc(d) + state + '</div>';
        };
        return '<div class="wa-brief wa-brief-live" id="wa-brief-block">'
          + '<div class="wa-brief-line" style="font-weight:600;margin-bottom:3px;">今日世界简报（第 ' + esc(String(v.round)) + ' 轮 · 共写入 ' + esc(String(v.written)) + ' 笔）</div>'
          + rows.slice(0, v.maxRows || 8).map(lineTxt).join('')
          + (v.quiet === true ? '<div class="wa-dim">这一轮没有新写入（世界在消化存量）</div>' : '')
          + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-brief-block">世界简报读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.286.0（V7 EXV7-2）：人物意图看板 —— 「他在图什么、卡在哪一步」。
    //   与 briefBlock 的分工：简报答「机制这一轮吃了几笔」（系统面），本块答
    //   「**每个人**在图什么、走到第几步、卡在哪」（人物面）。数据全部读 plan.chain，
    //   本块不推断、不补行。四条口径与 briefBlock 同规（整句取自引擎 / 关着不占屏 /
    //   缺席如实报 / 异常不外抛）+ 三条本块特有：
    //     ① **卡点单独成列**（资源缺口与前置未完成分两类，不合并成「受阻」）；
    //     ② **拟稿不冒充事实** —— step.status 非 done 的行标「打算」，与 plan.review 的
    //        asFact:false 同口径（看板说「他打算做」，不说「他做了」）；
    //     ③ **chain 报不出卡点的人不进看板**（引擎侧已经这样做；面板不补「（无）」行）。
    const intelNetworkBlock = (function () {
      try {
        if (!WA.intel || typeof WA.intel.network !== 'function') return '<div class="wa-dim" id="wa-intel-network-block">情报网读数不可用（engines/intel.js 缺席）</div>';
        const cfg = typeof WA.intel.getSettings === 'function' ? WA.intel.getSettings() : null;
        if (!cfg || cfg.enabled !== true) return '';
        const v = WA.intel.network();
        if (!v || v.ok !== true) return '<div class="wa-dim" id="wa-intel-network-block">情报网读数不可用（' + esc(String((v && v.reason) || 'unknown')) + '）</div>';
        if (!v.rows.length) return '<div class="wa-dim" id="wa-intel-network-block">情报网：目前没有人物持有情报' + (v.inTransit ? '，但有 ' + v.inTransit + ' 条在途' : '') + '</div>';
        const line = function (r) {
          const horizon = r.remainingRounds === null ? '未设期限' : ('还能撑 ' + r.remainingRounds + ' 轮');
          return '<div class="wa-intel-net-line"><b>' + esc(r.person) + '</b>：' + esc(r.claim || '') + ' · 来源 ' + esc(r.source || '未记录') + ' · 置信 ' + esc(String(r.confidence == null ? '?' : r.confidence)) + ' · ' + (r.state === 'in-transit' ? '在途' : '已持有') + ' · ' + horizon + '</div>';
        };
        return '<div class="wa-intel-net wa-intel-net-live" id="wa-intel-network-block"><div class="wa-intel-net-head">情报网（' + esc(String(v.people)) + ' 人 · ' + esc(String(v.rows.length)) + ' 条' + (v.inTransit ? ' · 在途 ' + esc(String(v.inTransit)) : '') + '）</div>' + v.rows.map(line).join('') + (v.truncated ? '<div class="wa-dim">只展示最近 ' + esc(String(v.cap)) + ' 条</div>' : '') + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-intel-network-block">情报网读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    const intentBlock = (function () {
      try {
        if (!WA.intentBoard || typeof WA.intentBoard.view !== 'function') {
          return '<div class="wa-dim" id="wa-intent-block">人物意图看板读数不可用（engines/intent-board.js 缺席）</div>';
        }
        const cfg = (typeof WA.intentBoard.getSettings === 'function') ? WA.intentBoard.getSettings() : null;
        if (!cfg || cfg.enabled !== true) return '';   // 关着就整块不渲染（同 briefBlock 口径）
        // 直接消费 board() 读口：面板展示与诊断共用同一张实时看板，不再另造快照。
        const v = WA.intentBoard.board();
        if (!v || v.ok !== true) {
          // 「这台引擎没装」与「大家都没计划」是两件事，分开报
          if (v && v.reason === 'no-plan-engine') {
            return '<div class="wa-dim" id="wa-intent-block">人物意图看板：plan 引擎缺席（engines/plan.js 未加载）—— 这栏空着不是「没人有计划」</div>';
          }
          return '<div class="wa-dim" id="wa-intent-block">人物意图看板读数不可用（' + esc(String((v && v.reason) || 'unknown')) + '）</div>';
        }
        if (v.empty === true) {
          return '<div class="wa-dim" id="wa-intent-block">人物意图看板：查了 ' + esc(String(v.checked)) + ' 人，没人有可读的计划链</div>';
        }
        const one = function (r) {
          const at = r.step
            ? ('第 ' + esc(String(r.step.seq)) + '/' + esc(String(r.total)) + ' 步「' + esc(r.step.text) + '」')
            : '（链上没有当前步）';
          // 拟稿不冒充事实：只有 done 才算已结算，其余标「打算」
          const mark = r.step ? (r.step.asFact === true
            ? '<span class="wa-dim">已结算</span>'
            : '<span class="wa-dim">打算</span>') : '';
          const block = r.blocked.length
            ? '<div class="wa-intent-block">卡在：' + esc(r.blocked.join('、')) + '</div>'
            : '<div class="wa-dim">没卡点</div>';
          const rest = r.rest.length
            ? '<div class="wa-dim">后面还有 ' + esc(String(r.restTotal)) + ' 步：' + esc(r.rest.map(function (s) { return s.seq + '.' + s.text; }).join(' → ')) + '</div>'
            : '';
          return '<div class="wa-intent-row">'
            + '<div class="wa-intent-line"><b>' + esc(r.name) + '</b> → ' + esc(r.goalText || '') + mark + '</div>'
            + '<div class="wa-intent-line">' + esc(at) + (r.tries ? ' <span class="wa-dim">（已试 ' + esc(String(r.tries)) + ' 次）</span>' : '') + '</div>'
            + block + rest
            + '</div>';
        };
        // 受阻人数从逐行读数算（board() 只逐行给 isBlocked，不给顶层计数 —— 不另造一个会漂的汇总）
        const nBlocked = v.rows.filter(function (r) { return r.isBlocked === true; }).length;
        return '<div class="wa-intent wa-intent-live" id="wa-intent-block">'
          + '<div class="wa-intent-line" style="font-weight:600;margin-bottom:3px;">人物意图看板（共 ' + esc(String(v.rows.length)) + ' 人 · 受阻 ' + esc(String(nBlocked)) + '）</div>'
          + v.rows.map(one).join('')
          + (v.capped === true ? '<div class="wa-dim">只展示前 ' + esc(String(v.maxRows)) + ' 人（看板行数上限可在设置页调）</div>' : '')
          + '</div>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-intent-block">人物意图看板读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    })();
    // v2.380.0 (V21 OPV21-3): V19/V20/V21 三个跨版本态势大盘**真正挂进概览页**。
    //   缺陷（实测立据）：renderV19ImmersionFold / renderV20HolomapDashboard /
    //   renderV21CivEcoHub 三个函数此前**全仓零调用点** —— 只有 tests/ 里手动调用，
    //   产品渲染路径从未拼过它们。于是「V21 文明盛衰与生态全景控制大盘」在
    //   dead-export 台账里被登记成 reason:test-only（把缺陷写进台账合法化），
    //   而玩家永远看不到这个大盘。这里用宿主同一套渲染函数 + 取 innerHTML 的方式挂载，
    //   不另写一份大盘 HTML（另写一份就是第二个措辞真源）。
    //   三态如实：渲染函数缺席 ⇒ 不注入（不假装注入了空大盘）；
    //             渲染抛错 ⇒ 吞掉并出一行可归因的读数，不影响整页渲染
    //             （一个附加大盘挂掉不该让概览页白屏）。
    //   层级：全部默认收起（<details> 不带 open）—— 它们是**按需查阅**的态势面，
    //         不是首屏要看的东西。这正是「面板再次简化」的同一条口径。
    const __dashboardBlock = (function (fnName, label, fn) {
      try {
        if (typeof fn !== 'function') {
          return '<div class="wa-dim" id="wa-dash-missing-' + esc(fnName) + '">' + esc(label) + '读数不可用（渲染口缺席）</div>';
        }
        // 真 DOM 下走文档宿主建节点再取 innerHTML；无 DOM（测试壳）下退回 headless 返回值
        let html = '';
        if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
          const holder = document.createElement('div');
          const r = fn.call(WA.ui, holder);
          if (r && r.headless === true) {
            // 宿主建节点失败（无真 DOM）：不出假大盘，如实说明
            return '<div class="wa-dim" id="wa-dash-headless-' + esc(fnName) + '">' + esc(label) + '在无界面环境下不渲染</div>';
          }
          html = holder.innerHTML || '';
        } else {
          return '<div class="wa-dim" id="wa-dash-nodom-' + esc(fnName) + '">' + esc(label) + '在无界面环境下不渲染</div>';
        }
        if (!html) return '';
        return '<details class="wa-details wa-dash-mount" id="wa-dash-fold-' + esc(fnName) + '" style="margin:8px 0;border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:4px 8px;">'
          + '<summary class="wa-summary">' + esc(label) + '</summary>'
          + '<div style="padding-top:6px;">' + html + '</div></details>';
      } catch (e) {
        return '<div class="wa-dim" id="wa-dash-err-' + esc(fnName) + '">' + esc(label) + '读数异常：' + esc((e && e.message) || e) + '</div>';
      }
    });
    //   **押手为什么不用 WA.ui[fnName] 取**：本仓的引用面扫描（inventory / dead-export-gate）
    //   只认 `WA.ui.renderXxx` 这种字面形态，动态下标一律读成零引用 ——
    //   用下标取会让刚接好的线又被判成「死导出」，等于把修复改回缺陷。
    //   故三处引用写成字面量，fn 只为约束「宿主确实是个函数」。
    const v19FoldBlock = __dashboardBlock('renderV19ImmersionFold',
      '🌊 沉浸式深水机制与暗网总览（V19）', WA.ui && WA.ui.renderV19ImmersionFold);
    const v20HolomapBlock = __dashboardBlock('renderV20HolomapDashboard',
      '🌐 纪元全息态势仪表大盘（V20）', WA.ui && WA.ui.renderV20HolomapDashboard);
    const v21CivEcoBlock = __dashboardBlock('renderV21CivEcoHub',
      '🏛️ 文明盛衰与生态全景控制大盘（V21）', WA.ui && WA.ui.renderV21CivEcoHub);
    return `
      <div class="wa-stat-grid">
        <div class="wa-stat"><div class="wa-stat-v">${esc(s.clock.label || '未设定')}</div><div class="wa-stat-k">世界时间</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${Object.keys(s.people).length}</div><div class="wa-stat-k">追踪人物</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${s.currents.length}</div><div class="wa-stat-k">活跃暗流</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${s.memory.facts.filter(f=>f.active).length}</div><div class="wa-stat-k">长期事实</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${s.evolution.round}</div><div class="wa-stat-k">演化回合</div></div>
        <div class="wa-stat"><div class="wa-stat-v">${beforeN}+${afterN}</div><div class="wa-stat-k">工作流节点</div></div>
      </div>
      ${firstBlock}
      ${firstLine}
      ${diaryBlock}
      ${briefBlock}
      ${intentBlock}
      ${intelNetworkBlock}
      ${routeBlock}
      ${tempBlock}
      ${calBlock}
      ${costBlock}
      ${saveBlock}
      ${v19FoldBlock}
      ${v20HolomapBlock}
      ${v21CivEcoBlock}
      <details class="wa-details" style="margin:8px 0;border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:4px 8px;">
        <summary style="cursor:pointer;opacity:0.75;font-size:12px;">🛠️ 引擎自检与底层读数</summary>
        <div style="padding-top:6px;">
          ${capLine}
          ${healthLine}
          ${visLine}
        </div>
      </details>
      <div data-omniscient>${heartbeatBlock()}${evictBlock()}${randBlock()}${clockBlock()}${bridgeBlock()}${lonshaBlock()}${v22OmensBlock()}</div>
      <details class="wa-details" style="margin:8px 0;border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:4px 8px;">
        <summary style="cursor:pointer;opacity:0.75;font-size:12px;">⚡ 工作流节点开关（${nodes.length}）</summary>
        <div class="wa-sec" style="margin-top:4px;">工作流节点开关</div>
        <div class="wa-node-list">${nodes.map(n => `
          <label class="wa-node">
            <input type="checkbox" data-node="${esc(n.id)}" ${n.enabled ? 'checked' : ''}/>
            <span class="wa-node-chain ${n.chain}">${n.chain === 'before' ? '前' : '后'}</span>
            <span class="wa-node-label">${esc(n.label || n.id)}</span>
          </label>`).join('')}
        </div>
      </details>`;
  }
  // ══ 段体结束 ══
  const API = {
    renderOverview: renderOverview,
    bind: bind,
    ver: '2.401.0'
  };
  WA.panelOverviewMain = API;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/overview-main.js', { kind: 'ui', ver: '2.401.0' });
  }
})();
