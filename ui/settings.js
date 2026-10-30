/** WorldAxis ui/settings.js (v0.2) — 推演设置页（尺度/时间/脉搏/预算/舆情） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '"' }[c])); }
  // v2.262.0（V6 OPV6-7）：当前选中的玩家动线。放在模块级（不是 render 局部）的理由：
  //   设置页会被状态事件整块重绘，render() 是纯函数、不吃参数；选中态若只活在一次渲染里，
  //   每来一个 clock:changed 玩家就被踢回「全部」——那是「靠一次点击活着」的状态。
  //   取值域与 LANES 的 lane 一致（'all' 为缺省 = 不隐藏任何东西）。
  let __laneSel = 'all';

  /**
   * v2.51.0（第三十六面）叙事工艺设置面（五轴）。
   *   渲染成独立函数而不是内联在模板里：本块有六处需要从引擎档位表取数，内联会让
   *   render() 变成第二个档位真源（枚举改了这里不改就是静默漂移）。
   *   档位下拉一律由 WA.style.CHOICES × CHOICE_LABELS 生成 —— 单一真源。
   */
  function styleBlockHtml() {
    if (!WA.style || typeof WA.style.getSettings !== 'function') {
      return '<div class="wa-sec" data-wa-lane="story" data-wa-sec="叙事工艺">叙事工艺设置面</div><div class="wa-dim">叙事工艺模块未加载（engines/style.js）</div>';
    }
    const st = WA.style.getSettings();
    const opt = (axis) => WA.style.CHOICES[axis]
      .map(v => `<option value="${v}" ${st[axis] === v ? 'selected' : ''}>${esc(WA.style.CHOICE_LABELS[v] || v)}</option>`).join('');
    // 五行的控件 id 一律**字面量写在模板里**，不走 `id="${变量}"`。原因不是风格：
    //   v2.2.0 块8 的守卫不变量（tests/run.js H2）用 `/id="(wa-[a-z0-9\-]+)"/` 从
    //   ui/*.js 源码里采集「渲染出的控件」，再与 UI_BINDINGS 对账「无僵尸条目」。
    //   若 id 由变量拼出来（`id="${id}"`），采集面**看不到这五个控件**，而它们又已写进
    //   守卫表 ⇒ 门禁立刻报僵尸条目（本版实测正是这五个）。参数化那个 row() 在这里
    //   省不了几行，换来的却是「门禁看不见这五个控件」——恰是本门禁要消灭的那类盲区。
    //   档位选项仍由 CHOICES × CHOICE_LABELS 生成（单一真源），只有标签/id/title 是字面量。
    return `
      <div class="wa-sec" data-wa-lane="story" data-wa-sec="叙事工艺">叙事工艺设置面<span class="wa-dim">（正文怎么写；全部默认「不设定」= 零 token 占用）</span></div>
      <label class="wa-node"><input type="checkbox" id="wa-st-block" ${st.block === 'on' ? 'checked' : ''}/><span class="wa-node-label">启用叙事工艺约束（关闭则整块不注入）</span></label>
      <div class="wa-set-row"><span>段落节奏</span><select id="wa-st-para" class="wa-input" title="单段字数的目标区间与换行密度">${opt('paragraphStyle')}</select></div>
      <div class="wa-set-row"><span>叙事视角</span><select id="wa-st-persp" class="wa-input" title="以谁的眼睛看这个场景">${opt('perspective')}</select></div>
      <div class="wa-set-row"><span>玩家角色人称</span><select id="wa-st-pron" class="wa-input" title="正文里指代玩家角色用第几人称">${opt('userPronoun')}</select></div>
      <div class="wa-set-row"><span>演绎授权</span><select id="wa-st-takeover" class="wa-input" title="是否代写玩家角色的言行（越靠右授权越大）">${opt('takeover')}</select></div>
      <div class="wa-set-row"><span>转述授权</span><select id="wa-st-narrate" class="wa-input" title="是否复述/融入玩家的上一句输入">${opt('narrate')}</select></div>
      <textarea id="wa-st-custom" class="wa-ta" placeholder="附加的写作要求（≤500 字，例如：少用比喻、对白不加引号…）">${esc(st.custom || '')}</textarea>
      <button class="wa-btn" id="wa-st-save">保存叙事工艺</button>
      <div id="wa-st-out" class="wa-out"></div>
      <div class="wa-dim">当前：${esc(WA.style.summaryText())}</div>
      <div class="wa-dim">保存后还需在「导演」页的注入可见性里开启「叙事工艺」源，否则不注入正文。</div>`;
  }

  /**
   * v2.129.0（缝合 A1–A10）: 十引擎总开关面板。
   *   治的病：这十个引擎的 `enabled` 默认都是 false，而全仓**零 UI 入口** ——
   *   能力已落盘、也各接了读者，用户却一个都开不了（等同不可用）。
   *   本块逐行调各引擎既有的 `setSettings`（不新增第二套写口），
   *   并把「开关点了零效果」的真因就地标出来（模块未装载 / 注入源未勾选）。
   *   注：十一行一律**字面量**写 id（不走 `id="${变量}"`）——门禁 H2 从 ui/*.js 源码
   *   采集 `id="wa-…"` 再与 UI_BINDINGS 对账，动态拼出的 id 在采集面「不存在」，
   *   会被当场判成僵尸条目（与 v2.51.0 叙事工艺五控件同一条坑）。
   */
  // v2.138.0（E7）：天气造灾害开关的取值读数 —— 与上面的 ini() 分列的理由是**它们问的是两件事**：
  //   ini() 问「总开关开没开」（enabled），这里问「联动开没开」（weatherLink）。合并成一个函数
  //   会在未来某一版被某个人顺手复用（那时两个开关就共用一个答案了）。
  function hzwxOn() {
    if (!WA.hazard || typeof WA.hazard.getSettings !== 'function') return false;
    try { return !!WA.hazard.getSettings().weatherLink; } catch (e) { return false; }
  }
  function switchBlockHtml() {
    // 控件 id 一律**字面量**写在模板里。门禁 H2 用 /id="(wa-[a-z0-9\-]+)"/ 从
    //   ui/*.js 源码采集「渲染出的控件」再与 UI_BINDINGS 对账「无僵尸条目」——
    //   id 若由变量拼出（id="' + lit + '"），采集面看不到它，而它又已写进守卫表
    //   ⇒ 门禁当场报僵尸条目（v2.51.0 叙事工艺五控件踩过同一条坑）。
    //   故这里十行**逐行写死**，只把 checked / disabled 做成运行时求值。
    const ini = function (ns, always) {
      if (always) return true;
      if (!WA[ns] || typeof WA[ns].getSettings !== 'function') return false;
      return !!WA[ns].getSettings().enabled;
    };
    const dis = function (ns, always) {
      if (always) return ' disabled';
      return (WA[ns] && typeof WA[ns].setSettings === 'function') ? '' : ' disabled';
    };
    return '<div class="wa-sec" data-wa-lane="power" data-wa-sec="缝合引擎总开关">缝合引擎总开关（v2.129.0 · A1–A10）<span class="wa-dim">（十项默认全关；模块未装载时置灰）</span></div>'
      + '<label class="wa-row" title="用户亲手改定的条目，自动推演不得静默覆盖"><input type="checkbox" id="wa-sw-userlock" data-sw-ns="userlock"' + (ini('userlock') ? ' checked' : '') + dis('userlock') + '/> 用户锁定记忆</label>'
      + '<label class="wa-row" title="走 rewrite 通道改写文本（instruction 必填，失败一律回原文）"><input type="checkbox" id="wa-sw-rewriter" data-sw-ns="rewriter"' + (ini('rewriter') ? ' checked' : '') + dis('rewriter') + '/> AI 改写命中内容</label>'
      + '<label class="wa-row" title="要求每楼正文产出自描述时间标签，供与「世界钟」对账"><input type="checkbox" id="wa-sw-storyclock" data-sw-ns="storyclock"' + (ini('storyclock') ? ' checked' : '') + dis('storyclock') + '/> 正文时间锚点</label>'
      + '<label class="wa-row" title="蓄势/保持/释放/停顿单向推进相位，并管叙事手法冷却"><input type="checkbox" id="wa-sw-rhythmloop" data-sw-ns="rhythmLoop"' + (ini('rhythmLoop') ? ' checked' : '') + dis('rhythmLoop') + '/> 呼吸式节奏环</label>'
      + '<label class="wa-row" title="登记意象使用次数；窗口内用过头即报「已过量」"><input type="checkbox" id="wa-sw-motif" data-sw-ns="motif"' + (ini('motif') ? ' checked' : '') + dis('motif') + '/> 文体档案</label>'
      + '<label class="wa-row" title="未到达的蓝图节拍一个字都不许提前写（只报计数，不给内容）"><input type="checkbox" id="wa-sw-beatmask" data-sw-ns="beatMask"' + (ini('beatMask') ? ' checked' : '') + dis('beatMask') + '/> 信息迷雾</label>'
      + '<label class="wa-row" title="开聊前先写设定（存本模块自己的键，不进世界状态）"><input type="checkbox" id="wa-sw-presetworld" data-sw-ns="presetWorld"' + (ini('presetWorld') ? ' checked' : '') + dis('presetWorld') + '/> 静态设定缓存</label>'
      + '<label class="wa-row" title="给对手钉战力区间，防「三流打手变五五开」的机械膨胀"><input type="checkbox" id="wa-sw-poweranchor" data-sw-ns="powerAnchor"' + (ini('powerAnchor') ? ' checked' : '') + dis('powerAnchor') + '/> 战力锚</label>'
      + '<label class="wa-row" title="落账最近若干份发往副 API 的报文（密钥打码，只存内存不写盘）"><input type="checkbox" id="wa-sw-requestviewer" data-sw-ns="requestViewer"' + (ini('requestViewer') ? ' checked' : '') + dis('requestViewer') + '/> 请求报文预览器</label>'
      + '<label class="wa-row" title="按标题/关键词/正文三面搜索条目缓存（纯读，恒开）"><input type="checkbox" id="wa-sw-wbsearch" data-sw-ns="wbSearch"' + (ini('wbSearch', true) ? ' checked' : '') + ' disabled/> 世界书即时搜索 <span class="wa-dim">（恒开：只读一份内存数组，关掉无收益）</span></label>'
      // v2.130.0（拓展计划 A1..A4 / B1 / C1 / C2 / D1..D4）：十二个新引擎的总开关（同
      //   v2.129.0 理由：渲染 + 绑定 + 守卫登记三件齐做，否则 id 写错无人发现）。
      //   控件 id 一律**字面量**写死（不走变量拼接）：门禁 H2 用 /id="(wa-[a-z0-9\-]+)"/
      //   从 ui/*.js 源码采集渲染控件再与 UI_BINDINGS 对账，动态拼出的 id 在采集面「不存在」。
      + '<label class="wa-row" title="切聊天/切角色/换源后，在途请求的结果一律作废（裸写会把旧聊天的账写进新聊天）"><input type="checkbox" id="wa-sw-staleguard" data-sw-ns="staleGuard"' + (ini('staleGuard') ? ' checked' : '') + dis('staleGuard') + '/> 迟到结果拦截</label>'
      + '<label class="wa-row" title="只净化正文：状态栏/结构块/代码块先剥离再拼回（防规则把它们误删）"><input type="checkbox" id="wa-sw-purifyscope" data-sw-ns="purifyScope"' + (ini('purifyScope') ? ' checked' : '') + dis('purifyScope') + '/> 净化作用域保护</label>'
      + '<label class="wa-row" title="写清「思考该多克制」；正文空或不足阈值时报不短于判断线（防预算被思考吃光）"><input type="checkbox" id="wa-sw-reasoning" data-sw-ns="reasoning"' + (ini('reasoning') ? ' checked' : '') + dis('reasoning') + '/> 思考开销与正文保底</label>'
      + '<label class="wa-row" title="按角色设走向档：自然发展 / 温暖向好 / 冲突增强 / 悲剧倾向（只约束方向，不预告情节）"><input type="checkbox" id="wa-sw-storytone" data-sw-ns="storyTone"' + (ini('storyTone') ? ' checked' : '') + dis('storyTone') + '/> 剧情倾向档</label>'
      + '<label class="wa-row" title="自定义月名与每月天数；超范围标「日期待确认」不推算"><input type="checkbox" id="wa-sw-calendarplan" data-sw-ns="calendarPlan"' + (ini('calendarPlan') ? ' checked' : '') + dis('calendarPlan') + '/> 自定义历法</label>'
      + '<label class="wa-row" title="写前预演：报「这份修复有 N 处这张卡不接受」，不改任何状态"><input type="checkbox" id="wa-sw-preflight" data-sw-ns="preflight"' + (ini('preflight') ? ' checked' : '') + dis('preflight') + '/> 写前预演与检查存档</label>'
      + '<label class="wa-row" title="只隐藏有逐楼记忆覆盖的旧楼，保最近 N 层；缺 L0 保持可见"><input type="checkbox" id="wa-sw-archivehide" data-sw-ns="archiveHide"' + (ini('archiveHide') ? ' checked' : '') + dis('archiveHide') + '/> 自动隐藏归档楼层</label>'
      + '<label class="wa-row" title="核字数，不足目标九成即报「续写后再落地」"><input type="checkbox" id="wa-sw-wordbudget" data-sw-ns="wordBudget"' + (ini('wordBudget') ? ' checked' : '') + dis('wordBudget') + '/> 字数闭环</label>'
      + '<label class="wa-row" title="配置按 聊天 > 角色 > 默认 三级取；离场即回落下层"><input type="checkbox" id="wa-sw-binding" data-sw-ns="binding"' + (ini('binding') ? ' checked' : '') + dis('binding') + '/> 配置绑定优先级</label>'
      + '<label class="wa-row" title="档案规范化 / 合并重复 / 提炼浓缩（不生成新内容）"><input type="checkbox" id="wa-sw-refine" data-sw-ns="refine"' + (ini('refine') ? ' checked' : '') + dis('refine') + '/> 档案精编</label>'
      + '<label class="wa-row" title="把一句话润色成多个版本供选；选中后才进主链"><input type="checkbox" id="wa-sw-polish" data-sw-ns="polish"' + (ini('polish') ? ' checked' : '') + dis('polish') + '/> 输入润色</label>'
      // v2.135.0（E6）：伏笔生命周期总开关（同 v2.129.0/v2.130.0 理由：渲染 + 绑定 +
      //   守卫登记三件齐做，否则 id 写错无人发现）。控件 id 一律**字面量**写死（不走
      //   变量拼接）：门禁 H2 用 /id="(wa-[a-z0-9\-]+)"/ 从 ui/*.js 源码采集渲染控件
      //   再与 UI_BINDINGS 对账，动态拼出的 id 在采集面「不存在」。
      + '<label class="wa-row" title="登记伏笔并提出「埋了没收」的清单；兑现只看显式标记，过期只提示不自动回收"><input type="checkbox" id="wa-sw-foreshadow" data-sw-ns="foreshadow"' + (ini('foreshadow') ? ' checked' : '') + dis('foreshadow') + '/> 伏笔生命周期</label>'
      // v2.138.0（E7）：天气→灾害反向联动的开关（同 v2.129.0/v2.130.0/v2.135.0 理由：
      //   渲染 + 绑定 + 守卫登记三件齐做，否则 id 写错无人发现）。
      //   ⚠ 本行**故意不挂** data-sw-ns：那条通道一律写 `{ enabled: ... }`，而本开关管的是
      //   `weatherLink` —— 走同一通道会把 hazard 自己的总开关顺手改掉（一个控件改两个语义，
      //   正是「两套数并存」那一类最贵的缺陷）。故给它专用属性 + 专用绑定（见 switchBind 尾段）。
      + '<label class="wa-row" title="暴雨/暴雪达阈值时自动建一行灾害账（只建账：不改天气、不改通行）；默认关闭"><input type="checkbox" id="wa-sw-hazardwx" data-hzwx="link"' + (hzwxOn() ? ' checked' : '') + dis('hazard') + '/> 天气造灾害（累积风险）</label>'
      // v2.139.0（E9）：势力关系网读数（只读的图读数，渲染在事件页势力区下方）。
      //   挂在 settings 页是为了让「这张图能不能算」在**一处**可见：
      //   事件页那三枚按钮报的是读数本身，这里报的是它的开关档。
      + '<label class="wa-row" title="按势力的对外态度档推导关系网（边是推导值，带 basis 可复盘）；只算不写，不合并势力、不触发事件"><input type="checkbox" id="wa-sw-factiongraph" data-sw-ns="factionGraph"' + (ini('factionGraph') ? ' checked' : '') + dis('factionGraph') + '/> 势力关系网（只读图读数）</label>'
      // v2.202.0（Y7）：地图与关系可视化（engines/world-graph.js）。
      //   渲染 + 绑定 + 守卫登记三件齐做（同 v2.129.0/v2.135.0/v2.138.0/v2.139.0 规格）。
      //   本开关答「这个视图面算不算」；预算（节点/边上限）在图上那页由引擎 doc 与诊断面读。
      + '<label class="wa-row" title="把 atlas 的两层关系 / 势力推导边 / 关系六型登记放进同一幅图（视图面：只算不写，不落自己的边表）；默认开"><input type="checkbox" id="wa-sw-worldgraph" data-sw-ns="worldGraph"' + (ini('worldGraph') ? ' checked' : '') + dis('worldGraph') + '/> 地图与关系可视化（只读视图）</label>'
      // v2.139.0（E11）：剧情偏离度告警线。**读数与策略分列**——这条线只决定
      //   「多少算偏得多」（跨线时面板上标一个 ⚠），它**不改任何分**，也不触发任何拉回。
      //   与上面几行同取「挂 data-sw-ns 让通用通道写」：本设置只改一个数，
      //   走那条通道即可；`dis()` 保证设置面缺席时仍渲染（缺席本身就是断裂）。
      + '<div class="wa-set-row"><span>偏离度告警线（0–1，越线只在面板标 ⚠）</span>'
      + '<input type="number" min="0" max="1" step="0.05" value="' + (function () { try { return WA.canon ? WA.canon.getSettings().deviationAlert : 0.7; } catch (e) { return 0.7; } })() + '" aria-label="偏离度告警线" id="wa-sw-deviationalert" data-sw-ns="deviationAlert" class="wa-input wa-w60"/></div>'
      // 读数行：只说「开关状态 / 已触发几行 / 认哪几种天气」——**不假装有内容**（未开启时恒 0）。
      //   本行是 show-and-tell 的落点：v2.135.0 之后的教训是「能力落盘但用户无从确认它是否在跑」。
      + (function () {
        if (!WA.hazard || typeof WA.hazard.stat !== 'function') return '';
        const st = WA.hazard.stat();
        const on = WA.hazard.getSettings().weatherLink;
        const kinds = (WA.hazard.TRIGGER_KINDS || []).join(' / ') || '—';
        return '<div class="wa-dim" id="wa-hzwx-view">天气造灾害：' + (on ? '<b>已开</b>' : '关闭')
          + '｜已触发 ' + (Number(st.triggers) || 0) + ' 行｜认的天气：' + esc(kinds)
          + (on ? '' : '（关闭时一次账都不建）') + '</div>';
      })()
      // 群聊拒绝是**只读问路器**（无总开关）：控件恒开且置灰，仅作“当前是不是群聊”的可见读数。
      + '<label class="wa-row" title="本扩展只支持单主角对话；群聊下世界推演与写入一律拒绝并阻止写世界书"><input type="checkbox" id="wa-sw-grouprefuse"' + ((WA.groupGuard && typeof WA.groupGuard.isGroup === 'function' && WA.groupGuard.isGroup()) ? ' checked' : '') + ' disabled/> 群聊拒绝 <span class="wa-dim">（恒开：只读问路器）</span></label>'
      + '<label class="wa-row" title="净化/思考/字数三块只作用于当前那一次输出，不改世界状态"><input type="checkbox" id="wa-sw-note2130" disabled/> v2.130.0 十二引擎 <span class="wa-dim">（产注入块的两个：思考开销 / 剧情倾向——还须在「导演」页勾选对应源）</span></label>'
      + '<div id="wa-sw-out" class="wa-out"></div>'
      + '<div class="wa-dim">注：产注入块的五个（用户锁定 / 节奏环 / 文体档案 / 信息迷雾 / 战力锚）'
      + '还须在「导演」页勾选对应注入源，否则开关点了正文也不变。</div>';
  }

  /** 总开关绑定：逐行调各引擎**既有** setSettings（不新增第二套写口）。 */
  function switchBind(panelEl) {
    Array.prototype.forEach.call(panelEl.querySelectorAll('[data-sw-ns]'), function (cb) {
      cb.onchange = function () {
        const ns = cb.dataset.swNs;
        const mod = WA[ns];
        const o = panelEl.querySelector('#wa-sw-out');
        if (!mod || typeof mod.setSettings !== 'function') { if (o) o.textContent = '✗ 模块未装载：' + ns; return; }
        let w = null;
        try { w = mod.setSettings({ enabled: !!cb.checked }); }
        catch (e) { if (o) o.textContent = '✗ 保存异常：' + ((e && e.message) || e); return; }
        if (o) {
          o.textContent = (w && w.ok === false)
            ? ('✗ 保存失败：' + (w.reason || '未知原因') + '（改动未落盘）')
            : ('✓ ' + ns + ' 已' + (cb.checked ? '开启' : '关闭'));
        }
      };
    });
  }

  /**
   * v2.257.0（V6 OPV6-1）：设置页**顶部**的档位呈现。
   *   计划原文要求「设置页顶部呈现当前档位与『离下一档还差几个』」——为什么必须在顶部：
   *   玩家填完 API 的第一件事是「世界要开多少」，而档位此前只存在于机制页的折叠段里
   *   （默认收起、且玩家模式下机制页根本不可见）。放在设置页第一屏，它才是可发现的。
   *
   *   三条口径（与本仓既有纪律一致）：
   *   ① **引擎算、面板显示**：每个数字都取自 `capabilityTier.view()` 的真读数，
   *      面板不自己数开关（另数一遍就是第二个真源，改一处另一处静默漂移）。
   *   ② **读不到与关着分开**：引擎缺席时渲染「档位引擎未加载」，
   *      而不是渲染成「当前 lite、差 0 个」（后者会让玩家以为一切正常）。
   *   ③ **不重复造控件逻辑**：按钮只发动作，写盘与复核全在引擎侧；
   *      本块的出口显示引擎原话（`notEffective` 逐条列名，不折成「部分成功」）。
   */
  function tierBlockHtml() {
    if (!WA.capabilityTier || typeof WA.capabilityTier.view !== 'function') {
      return '<div class="wa-sec" data-wa-lane="power" data-wa-sec="世界规模">世界规模</div><div class="wa-dim">档位引擎未加载（engines/capability-tier.js 缺席）——世界会按各机制的出厂默认跑，无法一键调整。</div>';
    }
    let v = null;
    try { v = WA.capabilityTier.view(); } catch (e) { v = null; }
    if (!v) {
      return '<div class="wa-sec" data-wa-lane="power" data-wa-sec="世界规模">世界规模</div><div class="wa-dim">档位读数失败（view() 抛错）——请到「机制」页的「能力档位与启用面」查看诊断。</div>';
    }
    const NAMES = { lite: '轻', standard: '标准', full: '完整' };
    const btns = (v.tiers || []).map(function (t) {
      const cur = t.name === v.tier;
      return '<button class="wa-btn wa-mini" id="wa-set-tier-' + esc(t.name) + '" data-tier="' + esc(t.name) + '"'
        + (cur ? ' disabled' : '') + '>' + (cur ? '● ' : '') + esc(NAMES[t.name] || t.name) + '</button>';
    }).join('');
    const now = NAMES[v.tier] || v.tier;
    // `getSettings()` 在这里的真实用途：档位**配置本身**（granted / history）是玩家可见的
    //   状态，而不只是 view() 派生的那组计数。`granted` 是「本档位按住的东西」，
    //   它的长度与 view().running 不是同一件事（后者含出厂就开着的），两个数字并列
    //   才答得出「我这一档到底手动按住了几台」。`history` 长度与
    //   view().rollbackDepth 同源，这里只用它判「有没有可退的」，不另算一遍。
    let cfg = { granted: [], history: [] };
    try {
      if (typeof WA.capabilityTier.getSettings === 'function') {
        const raw = WA.capabilityTier.getSettings();
        cfg = { granted: (raw && raw.granted) || [], history: (raw && raw.history) || [] };
      }
    } catch (e) { /* 读配置失败不阻断渲染：下面只把它当附加读数，不当判据 */ }
    // 「离下一档还差几个」：`gap` 由引擎按下一档目标集现场数（不是「档大小相减」——
    //   玩家自己开过的那些会抵掉一部分，相减会答错）。
    const gapLine = v.next
      ? '离「' + esc(NAMES[v.next] || v.next) + '」还差 <b>' + v.gap + '</b> 个机制没开'
      : '已是最高档（世界机制全开）';
    const rb = v.rollbackDepth > 0
      ? '<button class="wa-btn wa-mini" id="wa-set-tier-rollback">退回上一档</button>'
      : '<span class="wa-dim">（无可退回的档位变更）</span>';
    return '<div class="wa-sec" data-wa-lane="power" data-wa-sec="世界规模">世界规模<span class="wa-dim">（一键决定这个世界的机制开多少；随时可退回）</span></div>'
      + '<div class="wa-set-row"><span>当前档位 <b id="wa-set-tier-now">' + esc(now) + '</b></span>'
      + '<span class="wa-row">' + btns + '</span></div>'
      + '<div class="wa-dim" id="wa-set-tier-gap">' + gapLine + ' · 此刻在跑世界机制 <b>' + v.running + '</b> / ' + v.mechanisms + ' 台'
      + '（关着 ' + v.dormant + ' 台，其中可开 ' + Math.max(0, v.dormant) + '）</div>'
      // 本档位手动按住几台 vs 回滚栈剩几步：两个数字并列才有意义 ——
      //   granted 是「档位按住的」，rollbackDepth 是「还能退几次」，前者是状态、后者是余地。
      + '<div class="wa-dim" id="wa-set-tier-hold">本档位按住 <b>' + (cfg.granted || []).length + '</b> 台机制'
      + ' · 回滚栈剩 <b>' + (cfg.history || []).length + '</b> / ' + v.rollbackCap + ' 步</div>'
      + '<div class="wa-row">' + rb + '</div>'
      + '<div class="wa-dim">档位不是「把开关拨一遍就报成功」：每一台都会真写盘、再当场读回来复核；'
      + '哪台没生效会在这里如实列名，绝不报「已开启」。你自己关掉的机制不会被档位擅自打开。</div>'
      + '<div id="wa-set-tier-out" class="wa-out"></div>';
  }

  /**
   * v2.262.0（V6 OPV6-7）：**玩家动线**分组表（单一真源）。
   *
   * 为什么要有这张表：设置页原有 13 个 `wa-sec` 是**按引擎分区**摆的（推演 / 记忆采样 /
   *   净化 / 区域 / 舆情 / 演化 / 随机事件 / 叙事工艺 / 缝合开关 / 世界规模 / 界面…），
   *   而玩家心里的问题是四句话：**世界怎么转 / 人怎么活 / 故事怎么讲 / 我有多少控制权**。
   *   两套分法不是谁错——引擎分区对排查有用，玩家动线对上手有用。本版**不删不改**引擎分区，
   *   只在它上面加一层动线导航：细项一个都没移动、没删除，切到「全部」就是原来的整页。
   *
   * lane 取值域（封闭集，专锁断言）：world / people / story / power / ui。
   *   多出来的 `ui` 是「界面」那一格（开发者模式开关），它在动线上属于「我有多少控制权」，
   *   但保留独立 lane 是为了让专锁能断言「每个 sec 都有归属」而不是硬塞。
   */
  const LANES = [
    { lane: 'all', label: '全部', hint: '不分组（就是原来的整页）' },
    { lane: 'world', label: '世界怎么转', hint: '推演尺度 / 区域 / 舆情 / 演化 / 随机事件' },
    { lane: 'people', label: '人怎么活', hint: '记忆采样与人物侧' },
    { lane: 'story', label: '故事怎么讲', hint: '叙事工艺 / 净化规则 / 自定义指令' },
    { lane: 'power', label: '我有多少控制权', hint: '世界规模档位 / 缝合引擎总开关' },
    { lane: 'ui', label: '界面', hint: '开发者模式' }
  ];
  /**
   * 动线导航条。
   *
   * ⚠ id 必须**逐行写死**（不遍历 LANES 拼）：门禁 H2 用 `/id="(wa-[a-z0-9\-]+)"/`
   *   从源码**字面量**采集「渲染出的控件」再与 UI_BINDINGS 对账；由映射表拼出的 id
   *   运行时存在、静态采集面里隐形 ⇒ 既是漏覆盖、又让守卫表对应条目变僵尸。
   *   v2.51.0 叙事工艺五控件踩过同一条坑，本处照它的修法办。
   * ⚠ 面板渲染的是 HTML 而非 markdown：说明文字里不许出现 `**…**`（会原样露出来）。
   */
  function laneNavHtml() {
    const dev = (WA.ui && typeof WA.ui.devMode === 'function') ? WA.ui.devMode() : false;
    return '<div class="wa-row" id="wa-lane-bar">'
      + '<button class="wa-btn wa-mini" id="wa-lane-all" data-wa-lane-go="all" title="不分组（就是原来的整页）">全部</button>'
      + '<button class="wa-btn wa-mini" id="wa-lane-world" data-wa-lane-go="world" title="推演尺度 / 区域 / 舆情 / 演化 / 随机事件">世界怎么转</button>'
      + '<button class="wa-btn wa-mini" id="wa-lane-people" data-wa-lane-go="people" title="记忆采样与人物侧">人怎么活</button>'
      + '<button class="wa-btn wa-mini" id="wa-lane-story" data-wa-lane-go="story" title="叙事工艺 / 净化规则 / 自定义指令">故事怎么讲</button>'
      + '<button class="wa-btn wa-mini" id="wa-lane-power" data-wa-lane-go="power" title="世界规模档位 / 缝合引擎总开关">我有多少控制权</button>'
      + '<button class="wa-btn wa-mini" id="wa-lane-ui" data-wa-lane-go="ui" title="开发者模式">界面</button>'
      + '</div>'
      + '<div class="wa-dim" id="wa-lane-note">按玩家动线分组：切一条动线只看这一路；'
      + '「全部」= 原来的整页（一个都不隐藏）。'
      + (dev ? '开发者模式下<b>不隐藏任何东西</b>。' : '') + '</div>';
  }
  /**
   * 按当前动线显隐设置页的子块。
   *
   * 判据（与数据同源）：逐个 `wa-sec` 读它自己的 `data-wa-lane`；它到**下一个** wa-sec
   *   之间的全部兄弟节点属于这一段。匹配当前动线就显示，否则 `display:none`。
   * 为什么不用 CSS：CSS 的 `~` 无法「止于下一个 sec」，会把后续全部隐藏 —— 那正是
   *   本仓反复付过价的「靠顺序活着的判据」。这里遍历一次、每次切换重算，不缓存。
   * 「全部」与开发者模式：**一律显示全部**（不隐藏是安全默认，分组错误靠它绕过）。
   * 返回读数（专锁据此断言，不靠猜 DOM）：`{ lane, shown, hidden, total }`。
   */
  function laneApply(rootEl, lane) {
    const out = { lane: lane, shown: 0, hidden: 0, total: 0, dev: false };
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return out;
    out.dev = (WA.ui && typeof WA.ui.devMode === 'function') ? WA.ui.devMode() : false;
    // 未知动线兜底：不在取值域里的 lane（拼错、旧调用、外部传进来）**一律回落「全部」**。
    //   理由：本函数的失败形态是「把整页藏光」，而设置页藏光是玩家完全无法自救的
    //   （导航条自己也在页里，若连它一起藏了就再也点不回来）。宁可多显示，不可空屏。
    //   专锁 L5 断言：未知 lane 与 'all' 读数同形，且 shown 等于 sec 总数。
    let inDomain = false;
    for (let lj = 0; lj < LANES.length; lj++) { if (LANES[lj].lane === lane) inDomain = true; }
    if (!inDomain) { out.fallback = true; lane = 'all'; out.lane = 'all'; }
    const showAll = (lane === 'all' || out.dev);
    const secs = Array.prototype.slice.call(rootEl.querySelectorAll('[data-wa-lane]'));
    out.total = secs.length;
    secs.forEach(function (sec, i) {
      // 本段尾部 = 下一个 sec 之前的最后一个兄弟（没有下一个就是父节点末子）
      const stop = (i + 1 < secs.length) ? secs[i + 1] : null;
      const own = sec.getAttribute('data-wa-lane');
      const vis = showAll || own === lane;
      const group = [sec];
      let cur = sec.nextElementSibling;
      while (cur && cur !== stop) { group.push(cur); cur = cur.nextElementSibling; }
      group.forEach(function (el) {
        if (!el || !el.style) return;
        el.style.display = vis ? '' : 'none';
      });
      if (vis) out.shown++; else out.hidden++;
    });
    return out;
  }
  WA.uiSettings = {
    /**
     * v2.262.0：分组函数的**对外读口**。
     *
     * 为什么要导出：分组逻辑若要被探针/专锁验证，只有两条路——
     *   ① 从源码里挖出 `laneApply` 的文本再 `vm.runInContext` 求值：闭包里的 `LANES`
     *      随之丢失（实测 ReferenceError: LANES is not defined），要验的东西还没验就先崩；
     *   ② 从这里调真函数：走到的是产品自己的闭包与产品自己的表。
     * 弯路会让「测到的」与「跑起来的」成为两份东西 —— 本仓反复付过价，故取 ②。
     *
     * ⚠ 这里**只导出 laneApply**，不导出 `lanes()`：本版一度加过 `lanes()` 让测试读
     *   动线表，dead-export-gate 当场报「仅测试引用（产品代码零引用）」。
     *   判据改读运行时真值（按钮的 data-wa-lane-go + laneApply 读数）——
     *   产品不为「让测试看得见」多长一个镜像面。
     */
    laneApply(rootEl, lane) { return laneApply(rootEl, lane); },
    render() {
      const bs = WA.backstage.getSettings();
      const op = WA.opinion.getSettings();
      const modes = [['light', '轻量'], ['balanced', '均衡'], ['deep', '深度'], ['manual', '手动']];
      const times = [['explicit', '严格'], ['cautious', '谨慎'], ['open', '开放'], ['world', '世界钟']];
      const pulses = [['quiet', '安静'], ['normal', '正常'], ['turbulent', '激荡']];
      // v2.7.0（收口）: 控件区间一律取自登记表声明（`boundsOf`）——此前每个 `<input min max>`
      //   都是一份**独立**的字面量：它既是「界面能拖到的范围」，又事实上是「引擎接受的契约」，
      //   而引擎自己的夹取常量住在别处（memory-sampler.js 跨文件、evolution._num 干脆不夹）。
      //   三处只要有一处改动不一致，就会出现「滑块能拖到的值被引擎夹掉」或「引擎接受但界面拖不到」
      //   的静默不一致。现在声明只有一份，界面与写路径读取同一份。
      const bd = k => (WA.settingsBus && WA.settingsBus.boundsOf) ? WA.settingsBus.boundsOf(k) : {};
      const bB = bd('worldaxis_backstage_settings_v1');
      const bO = bd('worldaxis_opinion_settings_v1');
      const bE = bd('worldaxis_evolution_settings_v1');
      const rng = (arr, fb) => Array.isArray(arr) ? arr : fb;
      return `
        ${laneNavHtml()}
        ${tierBlockHtml()}
        <div class="wa-sec" data-wa-lane="ui" data-wa-sec="界面">界面</div>
        <label class="wa-node"><input type="checkbox" id="wa-set-devmode" ${((WA.ui && typeof WA.ui.devMode === 'function') ? WA.ui.devMode() : false) ? 'checked' : ''}/><span class="wa-node-label">开发者模式（显示全部 32 个页签与分类导航；关闭则只保留概览 / 世界 / 人物 / 事件 / API / 设置 6 个日常页）</span></label>
        <div class="wa-dim">日常使用不需要开发者模式。机制页（拍 / 事件闭环 / 分支比较 / 供应链 / 沉积……）是排查与调参用的，藏在开关后面。</div>
        <div class="wa-sec" data-wa-lane="world" data-wa-sec="世界日记">世界日记<span class="wa-dim">（概览页那几句「你看不见的地方」怎么压）</span></div>
        ${(() => {
          // v2.265.0（V6 EXV6-1）：世界日记的设置面。
          //   为什么它必须有界面入口：引擎出厂 `enabled:true`，而它的三个开关里
          //   `includeOffline` 决定「你不在时发生的事」要不要并进日记 —— 那是一条**内容取舍**，
          //   玩家可能就想只看眼前、不想读离线那段。零入口 = 那条取舍由实现替玩家定死
          //   （本仓对这类「有设置没入口」已判过很多次：设置存在但改不到，等同不可用）。
          //   两条纪律：
          //   ① **只发动作**：写盘走 `worldDiary.setSettings`（引擎内唯一写路径，
          //      内含 settingsBus.saveOrThrow 与 bounds 归一），本页不直写 localStorage；
          //   ② **回显按真实结果**：`setSettings` 返回 ok:false 就报失败（同 wa-set-save 的裁决，
          //      v2.6.0 那次「恒报已保存」的坑不再重复）。
          if (!WA.worldDiary || typeof WA.worldDiary.getSettings !== 'function') {
            return '<div class="wa-dim">世界日记模块未加载（engines/world-diary.js 缺席）</div>';
          }
          const wd = WA.worldDiary.getSettings();
          // 区间取自登记表声明（与 wa-set-npc 同规：界面能拖到的范围 == 引擎接受的契约）
          const bdWd = (WA.settingsBus && WA.settingsBus.boundsOf) ? WA.settingsBus.boundsOf('worldaxis_world_diary_settings_v1') : {};
          const ml = rng(bdWd.maxLines, [1, 6]);
          return `<label class="wa-node"><input type="checkbox" id="wa-wd-enable" ${wd.enabled ? 'checked' : ''}/><span class="wa-node-label">在概览页显示世界日记</span></label>
            <div class="wa-set-row"><span>每屏句数 <b id="wa-wd-maxlinesv">${wd.maxLines}</b></span><input type="range" min="${ml[0]}" max="${ml[1]}" value="${wd.maxLines}" aria-label="每屏句数" id="wa-wd-maxlines" class="wa-range"/></div>
            <label class="wa-node"><input type="checkbox" id="wa-wd-offline" ${wd.includeOffline ? 'checked' : ''}/><span class="wa-node-label">并入「你不在时发生的事」（关掉则只报眼前的世界）</span></label>
            <button class="wa-btn" id="wa-wd-save">保存世界日记设置</button>
            <div id="wa-wd-out" class="wa-out"></div>
            <div class="wa-dim">日记只读既有事实（幕后生活 / 幕后 NPC 近况 / 离线结算），不新记一份、不调模型；地点名按你对那一处的可见性决定说不说，人物名照实报。</div>`;
        })()}
        <div class="wa-sec" data-wa-lane="people" data-wa-sec="人物今日动线">人物今日动线<span class="wa-dim">（概览页那几行「今天在哪、做了什么、接下来」怎么压）</span></div>
        ${(() => {
          // v2.266.0（V6 EXV6-2）：人物今日动线的设置面。
          //   同世界日记一样，出厂即有可用默认值，但三条取舍必须能被玩家改到：
          //   ① `showNext` —— 「接下来要去哪」是**预告**，本体上是泄露；有人就只想看已经发生的；
          //   ② `hidePlace` —— 地名说不说，与「看不看得见」是两件事（引擎里分成 suppressed / hidden 两支）；
          //   ③ `maxPeople` —— 概览页篇幅有限，报几个人得玩家自己定。
          //   两条纪律照抄世界日记段（同类问题不再二次踩）：
          //   ① **只发动作**：写盘走 `dayRoute.setSettings`（引擎内唯一写路径，内含 bounds 归一）；
          //   ② **回显按真实结果**：`setSettings` 返回 ok:false 就报失败。
          if (!WA.dayRoute || typeof WA.dayRoute.getSettings !== 'function') {
            return '<div class="wa-dim">人物动线模块未加载（engines/day-route.js 缺席）</div>';
          }
          const dr = WA.dayRoute.getSettings();
          const bdDr = bd('worldaxis_day_route_settings_v1');
          const mp = rng(bdDr.maxPeople, [1, 8]);
          return `<label class="wa-node"><input type="checkbox" id="wa-dr-enable" ${dr.enabled ? 'checked' : ''}/><span class="wa-node-label">在概览页显示人物今日动线</span></label>
            <div class="wa-set-row"><span>最多报几人 <b id="wa-dr-maxpv">${dr.maxPeople}</b></span><input type="range" min="${mp[0]}" max="${mp[1]}" value="${dr.maxPeople}" aria-label="最多报几人" id="wa-dr-maxp" class="wa-range"/></div>
            <label class="wa-node"><input type="checkbox" id="wa-dr-next" ${dr.showNext ? 'checked' : ''}/><span class="wa-node-label">带上「接下来要去哪」（关掉则只报已经发生的）</span></label>
            <label class="wa-node"><input type="checkbox" id="wa-dr-hideplace" ${dr.hidePlace ? 'checked' : ''}/><span class="wa-node-label">不显示地名（只报做了什么，不报在哪）</span></label>
            <button class="wa-btn" id="wa-dr-save">保存人物动线设置</button>
            <div id="wa-dr-out" class="wa-out"></div>
            <div class="wa-dim">只读既有事实（幕后生活安排 / 档期预约 / 此刻位置），不新记一份、不调模型。日程时间域的说明：只有当档期存的是绝对时间戳时才会被读成「此刻正在做什么」；存的是「第几点的钟点」那种，不硬猜成现在。</div>`;
        })()}
        ${(() => {
          const bdRt = bd('worldaxis_relation_temp_settings_v1');
          if (!WA.relationTemp || typeof WA.relationTemp.getSettings !== 'function') {
            return '<div class="wa-dim">关系温度计未加载（engines/relation-temp.js 缺席）</div>';
          }
          const rt = WA.relationTemp.getSettings();
          const mp = rng(bdRt.maxPeople, [1, 10]);
          return `<label class="wa-node"><input type="checkbox" id="wa-rt-enable" ${rt.enabled ? 'checked' : ''}/><span class="wa-node-label">在概览页显示关系温度计</span></label>
            <div class="wa-set-row"><span>最多显示几人 <b id="wa-rt-maxpv">${rt.maxPeople}</b></span><input type="range" min="${mp[0]}" max="${mp[1]}" value="${rt.maxPeople}" aria-label="最多显示几人" id="wa-rt-maxp" class="wa-range"/></div>
            <label class="wa-node"><input type="checkbox" id="wa-rt-types" ${rt.showTypes ? 'checked' : ''}/><span class="wa-node-label">展示关系六型结构（利益同盟/对手共生等）</span></label>
            <label class="wa-node"><input type="checkbox" id="wa-rt-reason" ${rt.showReason ? 'checked' : ''}/><span class="wa-node-label">展示升温/降温依据与事件记录</span></label>
            <button class="wa-btn" id="wa-rt-save">保存关系温度计设置</button>
            <div id="wa-rt-out" class="wa-out"></div>
            <div class="wa-dim">复用 bonds 关系六型与 fondness 好感审计，纯读聚合，绝不凭空捏造事件。</div>`;
        })()}
        <div class="wa-sec" data-wa-lane="world" data-wa-sec="暗流日历">暗流日历<span class="wa-dim">（未结算的事几时撞上、还剩多少窗口）</span></div>
        ${(() => {
          // v2.268.0（V6 EXV6-4）：暗流日历的设置面。
          //   三条取舍必须能被玩家改到：看几天、最多报几条、要不要透视隐秘暗流。
          //   纪律照抄关系温度计段：写盘只走引擎 setSettings；读数与滑块必须同列。
          const bdCal = bd('worldaxis_undercurrent_calendar_settings_v1');
          if (!WA.undercurrentCalendar || typeof WA.undercurrentCalendar.getSettings !== 'function') {
            return '<div class="wa-dim">暗流日历未加载（engines/undercurrent-calendar.js 缺席）</div>';
          }
          const uc = WA.undercurrentCalendar.getSettings();
          const hd = rng(bdCal.horizonDays, [1, 7]);
          const mi = rng(bdCal.maxItems, [1, 15]);
          return `<label class="wa-node"><input type="checkbox" id="wa-uc-enable" ${uc.enabled ? 'checked' : ''}/><span class="wa-node-label">在概览页显示暗流日历</span></label>
            <div class="wa-set-row"><span>向前看几天 <b id="wa-uc-hzv">${uc.horizonDays}</b></span><input type="range" min="${hd[0]}" max="${hd[1]}" value="${uc.horizonDays}" aria-label="向前看几天" id="wa-uc-hz" class="wa-range"/></div>
            <div class="wa-set-row"><span>最多报几条 <b id="wa-uc-maxv">${uc.maxItems}</b></span><input type="range" min="${mi[0]}" max="${mi[1]}" value="${uc.maxItems}" aria-label="最多报几条" id="wa-uc-max" class="wa-range"/></div>
            <label class="wa-node"><input type="checkbox" id="wa-uc-hidden" ${uc.showHidden ? 'checked' : ''}/><span class="wa-node-label">透视隐秘暗流（关掉则只显示可感知的迹象，防剧透）</span></label>
            <button class="wa-btn" id="wa-uc-save">保存暗流日历设置</button>
            <div id="wa-uc-out" class="wa-out"></div>
            <div class="wa-dim">只读既有暗流（stage 与剧情时间），按紧迫度投影成未来几天的风险日历；只读不改 stage、不新造事件。</div>`;
        })()}
        <div class="wa-sec" data-wa-lane="world" data-wa-sec="单轮成本卡">单轮成本卡<span class="wa-dim">（这一轮花了多少上下文、哪几条白花）</span></div>
        ${(() => {
          // v2.269.0（V6 EXV6-5）：单轮成本卡的设置面。
          //   三条取舍必须能被玩家改到：榜单列几个、要不要报耗时、要不要带长期趋势。
          //   纪律照抄暗流日历段：写盘只走引擎 setSettings；读数与滑块必须同列。
          //   ⚠ 默认关着的那一项（长期趋势）在界面上必须写明「它不是本轮读数」——
          //     否则玩家开了以后会把它当成本轮读数，正是本模块要防的那类误读。
          const bdCost = bd('worldaxis_round_cost_settings_v1');
          if (!WA.roundCost || typeof WA.roundCost.getSettings !== 'function') {
            return '<div class="wa-dim">单轮成本卡未加载（engines/round-cost.js 缺席）</div>';
          }
          const rc = WA.roundCost.getSettings();
          const tn = rng(bdCost.topN, [1, 12]);
          return `<label class="wa-node"><input type="checkbox" id="wa-rc-enable" ${rc.enabled ? 'checked' : ''}/><span class="wa-node-label">在概览页显示单轮成本卡</span></label>
            <div class="wa-set-row"><span>榜单最多列几个源 <b id="wa-rc-topnv">${rc.topN}</b></span><input type="range" min="${tn[0]}" max="${tn[1]}" value="${rc.topN}" aria-label="榜单最多列几个源" id="wa-rc-topn" class="wa-range"/></div>
            <label class="wa-node"><input type="checkbox" id="wa-rc-timing" ${rc.showTiming ? 'checked' : ''}/><span class="wa-node-label">报本轮注入链耗时（取自上一轮快照）</span></label>
            <label class="wa-node"><input type="checkbox" id="wa-rc-longtrend" ${rc.showLongTrend ? 'checked' : ''}/><span class="wa-node-label">附带长期耗时趋势（注意：那是全窗样本，不是本轮读数）</span></label>
            <button class="wa-btn" id="wa-rc-save">保存单轮成本卡设置</button>
            <div id="wa-rc-out" class="wa-out"></div>
            <div class="wa-dim">独占复用三处既有读口（预算裁决 / 注入价值 / 性能台账），不重算、不落新容器；只读存储，绝不结算。</div>`;
        })()}
        <div class="wa-sec" data-wa-lane="world" data-wa-sec="存档体检">存档体检<span class="wa-dim">（这局还能跑多久、建议先做什么）</span></div>
        ${(() => {
          // v2.270.0（V6 EXV6-6）：存档体检的设置面。
          //   ⚠ 这一格与前几格**不同**：它有两个**上游**开关（趋势面 / 水位面），
          //     出厂都是关的。把它们并在这里，是因为「体检单答不出还能跑多久」的
          //     唯一处置动作就是来这一格把它们开起来 —— 分到别处等于让玩家自己找。
          //   纪律照抄前几段：写盘只走各引擎 setSettings；读数与滑块必须同列。
          const bdSh = bd('worldaxis_save_health_settings_v1');
          const bdSf = bd('worldaxis_storage_forecast_v1');
          const bdCa = bd('worldaxis_capacity_audit_v1');
          if (!WA.saveHealth || typeof WA.saveHealth.getSettings !== 'function') {
            return '<div class="wa-dim">存档体检未加载（engines/save-health.js 缺席）</div>';
          }
          const sh = WA.saveHealth.getSettings();
          const sf = (WA.storageForecast && WA.storageForecast.getSettings) ? WA.storageForecast.getSettings() : null;
          const ca = (WA.capacityAudit && WA.capacityAudit.getSettings) ? WA.capacityAudit.getSettings() : null;
          const wr = rng(bdSh.warnRounds, [5, 200]);
          const ur = rng(bdSh.urgentRounds, [1, 50]);
          return `<label class="wa-node"><input type="checkbox" id="wa-sh-enable" ${sh.enabled ? 'checked' : ''}/><span class="wa-node-label">在概览页显示存档体检</span></label>
            <div class="wa-set-row"><span>少于几轮触顶就提示 <b id="wa-sh-warnv">${sh.warnRounds}</b></span><input type="range" min="${wr[0]}" max="${wr[1]}" value="${sh.warnRounds}" aria-label="少于几轮触顶就提示" id="wa-sh-warn" class="wa-range"/></div>
            <div class="wa-set-row"><span>少于几轮算紧急 <b id="wa-sh-urgentv">${sh.urgentRounds}</b></span><input type="range" min="${ur[0]}" max="${ur[1]}" value="${sh.urgentRounds}" aria-label="少于几轮算紧急" id="wa-sh-urgent" class="wa-range"/></div>
            <label class="wa-node"><input type="checkbox" id="wa-sh-forecaster" ${sf && sf.enabled ? 'checked' : ''}/><span class="wa-node-label">开启水位趋势面（不开就答不出「还能跑多久」；出厂关着）</span></label>
            <label class="wa-node"><input type="checkbox" id="wa-sh-waterline" ${ca && ca.enabled ? 'checked' : ''}/><span class="wa-node-label">开启容器水位面（不开就答不出「哪个容器满了」；出厂关着）</span></label>
            <button class="wa-btn" id="wa-sh-save">保存存档体检设置</button>
            <div id="wa-sh-out" class="wa-out"></div>
            <div class="wa-dim">只读聚合：当前体积（store 全量口径）+ 趋势外推 + 容器水位 + 未完成义务，四面并列成一句结论；不清理、不裁剪、不迁移。</div>`;
        })()}
        <div class="wa-sec" data-wa-lane="ui" data-wa-sec="一键交班">一键交班<span class="wa-dim">（把这一局的设定收成一个包，新局复原）</span></div>
        ${(() => {
          // v2.273.0（V6 EXV6-9）：一键交班设置面 + 打包 / 校验 / 复原三钮。
          //   四块材料分在四处（世界结构 / 行动规则 / 档位 / 题材设置），本格把它们收成一个包。
          //   ⚠ 缺块必须看得见：拿不到就写在「缺块」一行里并说去哪开，绝不静默少给。
          if (!WA.handoffPack || typeof WA.handoffPack.pack !== 'function') {
            return '<div class="wa-dim">一键交班未加载（engines/handoff-pack.js 缺席）</div>';
          }
          const hp = WA.handoffPack.getSettings();
          const snap = (() => { try { return WA.handoffPack.pack(); } catch (e) { return null; } })();
          const missRows = (snap && snap.missing && snap.missing.length)
            ? snap.missing.map(function (m) {
                return '<div class="wa-item"><b>' + esc(m.label) + '</b> <span class="wa-dim">（' + esc(m.why) + '）</span></div>';
              }).join('')
            : '<div class="wa-dim">四块齐全</div>';
          return `<label class="wa-node"><input type="checkbox" id="wa-hp-enable" ${hp.enabled ? 'checked' : ''}/><span class="wa-node-label">启用一键交班</span></label>
            <label class="wa-node"><input type="checkbox" id="wa-hp-bp" ${hp.includeBlueprint !== false ? 'checked' : ''}/><span class="wa-node-label">收进「世界结构」</span></label>
            <label class="wa-node"><input type="checkbox" id="wa-hp-rules" ${hp.includeRules !== false ? 'checked' : ''}/><span class="wa-node-label">收进「行动规则包」</span></label>
            <label class="wa-node"><input type="checkbox" id="wa-hp-tier" ${hp.includeTier !== false ? 'checked' : ''}/><span class="wa-node-label">收进「档位与按住清单」</span></label>
            <label class="wa-node"><input type="checkbox" id="wa-hp-theme" ${hp.includeTheme !== false ? 'checked' : ''}/><span class="wa-node-label">收进「题材与关键设置」</span></label>
            <div class="wa-dim">当前可取的块 / 缺块：</div>
            ${missRows}
            <button class="wa-btn" id="wa-hp-save">保存交班设置</button>
            <button class="wa-btn wa-mini" id="wa-hp-pack">打包并校验</button>
            <button class="wa-btn wa-mini" id="wa-hp-restore">用这份包复原</button>
            <div id="wa-hp-out" class="wa-out"></div>
            <div class="wa-dim">复原只调各模块自己的导入口并当场复核；缺块的包仍可用，但它复不出完整的一局（缺哪块、为什么，上面写着）。</div>`;
        })()}
        <div class="wa-sec" data-wa-lane="ui" data-wa-sec="玩家说明书">玩家说明书<span class="wa-dim">（装它会怎样、开哪档、坏了怎么办）</span></div>
        ${(() => {
          // v2.272.0（V6 EXV6-8）：玩家说明书的面板入口。
          //   为什么不直接读 docs/PLAYER_GUIDE.md：插件跑在宿主的沙箱里，读仓库里的 md
          //   没有稳定通道；「读不到就静默空屏」比没有入口更坏。故这里内联要点
          //   （与 docs/PLAYER_GUIDE.md 的六节一一对应，但不抄读数），末尾指路到那份全文。
          //   措辞口径与文档一致：两边都必须是玩家向（不许出现内部名词）。
          return `<div class="wa-dim">装好之后不会自动热闹起来：要先做三件事（配一个 API → 选一个档位 → 说第一句话）。概览页顶部的「开局引导」会指到你还差哪一步。</div>
            <div class="wa-dim">· 面板上写「读不到 / 测不到 / 读不全」= 这一格没查，不是坏了，也不是零。</div>
            <div class="wa-dim">· 「约 N 轮后」这类数字都是按最近增速往前推的直线，不是预言，增速一变就不准。</div>
            <div class="wa-dim">· 你的装机进度存在你自己的浏览器本地，不进存档（导给别人不会带过去）。</div>
            <div class="wa-dim">· 它只跟你自己配的那个接口地址说话，不外发别处。</div>
            <div class="wa-dim">全文随仓库一起：docs/PLAYER_GUIDE.md（含「坏了怎么办」的症状对照表）。</div>`;
        })()}
        <div class="wa-sec" data-wa-lane="ui" data-wa-sec="开局引导">开局引导<span class="wa-dim">（第一次开局的三个真实步骤）</span></div>
        ${(() => {
          // v2.271.0（V6 EXV6-7）：开局引导设置面。
          //   三步的**当前态**在这里也显示一遍 —— 玩家在概览页点了「知道了」之后，
          //   想回来看看进度只能到这一格（否则只能靠从头重装插件）。
          const bdFr = bd('worldaxis_first_run_settings_v1');
          if (!WA.firstRun || typeof WA.firstRun.getSettings !== 'function') {
            return '<div class="wa-dim">开局引导未加载（engines/first-run.js 缺席）</div>';
          }
          const fr = WA.firstRun.getSettings();
          const snap = (() => { try { return WA.firstRun.build(); } catch (e) { return null; } })();
          const snapRows = (snap && snap.ok === true)
            ? snap.steps.map(function (s) {
                const tag = s.state === 'done' ? '✓ 已完成'
                  : (s.state === 'cannot-tell' ? ('? 测不到' + (s.why2 ? '（' + esc(s.why2) + '）' : '')) : '○ 未完成');
                return '<div class="wa-item"><b>' + esc(s.order + '. ' + s.title) + '</b> <span class="wa-dim">'
                  + esc(tag) + (s.source === 'manual' ? '（你手勾的）' : '') + '</span></div>';
              }).join('')
            : '<div class="wa-dim">状态读数不可用</div>';
          const dt = (bdFr && bdFr.doneTalk) ? 'checked' : '';
          return `<label class="wa-node"><input type="checkbox" id="wa-fr-enable" ${fr.enabled ? 'checked' : ''}/><span class="wa-node-label">启用开局引导</span></label>
            <label class="wa-node"><input type="checkbox" id="wa-fr-showdone" ${fr.showWhenDone ? 'checked' : ''}/><span class="wa-node-label">三步都做完后仍留在概览页</span></label>
            <div class="wa-dim">三步当前态（环境读书优先；「测不到」的步可手勾兜底）：</div>
            ${snapRows}
            <label class="wa-node"><input type="checkbox" id="wa-fr-talk" ${dt}/><span class="wa-node-label">手动确认「说第一句话」这一步（仅当环境读不到时生效）</span></label>
            <button class="wa-btn" id="wa-fr-save">保存开局引导设置</button>
            <button class="wa-btn wa-mini" id="wa-fr-resume">重新显示引导</button>
            <button class="wa-btn wa-mini" id="wa-fr-reset">清空进度</button>
            <div id="wa-fr-out" class="wa-out"></div>
            <div class="wa-dim">三步的真实判据：API 配置字段 / 档位词条 / 注入快照与演化回合。进度只落设置族，不写存档（它是「你」的装机进度，不是世界里发生的事）。</div>`;
        })()}
        <div class="wa-sec" data-wa-lane="world" data-wa-sec="世界推演设置">世界推演设置</div>
        <div class="wa-set-row"><span>推演尺度</span><select aria-label="推演尺度" id="wa-set-mode" class="wa-input">${modes.map(m => `<option value="${m[0]}" ${bs.simulationMode === m[0] ? 'selected' : ''}>${m[1]}</option>`).join('')}</select></div>
        <div class="wa-set-row"><span>时间策略</span><select aria-label="时间策略" id="wa-set-time" class="wa-input">${times.map(t => `<option value="${t[0]}" ${bs.timePolicy === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></div>
        <div class="wa-set-row"><span>世界脉搏活跃度</span><select aria-label="世界脉搏活跃度" id="wa-set-pulse" class="wa-input">${pulses.map(p => `<option value="${p[0]}" ${bs.pulseActivity === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></div>
        <div class="wa-set-row"><span>NPC预算 <b id="wa-set-npcv">${bs.npcBudget}</b></span><input type="range" min="${rng(bB.npcBudget, [1, 16])[0]}" max="${rng(bB.npcBudget, [1, 16])[1]}" value="${bs.npcBudget}" aria-label="NPC预算" id="wa-set-npc" class="wa-range"/></div>
        <label class="wa-node"><input type="checkbox" id="wa-set-auto" ${bs.autoSimulate ? 'checked' : ''}/><span class="wa-node-label">每轮自动推演（关闭则仅手动）</span></label>
        <label class="wa-node"><input type="checkbox" id="wa-set-fullrules" ${bs.fullRules ? 'checked' : ''}/><span class="wa-node-label">注入世界规则全文（12模块铁律；关闭则仅精简守则，省token）</span></label>
        <label class="wa-node"><input type="checkbox" id="wa-set-sync" ${bs.syncToChat ? 'checked' : ''}/><span class="wa-node-label">镜像存档进聊天文件（随聊天跨设备同步；关闭则仅存本机）</span></label>
        <label class="wa-node"><input type="checkbox" id="wa-set-autobak" ${bs.autoBackup ? 'checked' : ''}/><span class="wa-node-label">轮次推进时自动备份（滚动保留最近 3 份，可恢复）</span></label>
        <div class="wa-set-row"><span>注入预算</span><select aria-label="注入预算" id="wa-set-budget-mode" class="wa-input">
          <option value="auto" ${bs.injectBudget == null || bs.injectBudget < 0 ? 'selected' : ''}>自动（按上下文窗口 6%）</option>
          <option value="unlimited" ${bs.injectBudget === 0 ? 'selected' : ''}>不限（全量注入）</option>
          <option value="manual" ${bs.injectBudget > 0 ? 'selected' : ''}>手动上限</option>
        </select></div>
        <div class="wa-set-row"><span>手动上限 <b id="wa-set-budgetv">${bs.injectBudget > 0 ? bs.injectBudget + 't' : '—'}</b></span><input type="range" min="200" max="6000" step="200" value="${bs.injectBudget > 0 ? bs.injectBudget : 2400}" aria-label="手动上限" id="wa-set-budget" class="wa-range"/></div>
        <div class="wa-dim">预算裁决：核心块（世界状态/近端事件）优先保底；记忆/摘要/账本/舆情超预算时先折叠后丢弃。自动档从宿主上下文窗口推导，夹在 800–4000t。</div>
        <div class="wa-sec" data-wa-lane="people" data-wa-sec="主观记忆采样">主观记忆采样（v0.9.9）</div>
        <div class="wa-set-row"><span>采样上限 <b id="wa-set-mslimitv">${bs.memSamplerLimit || 8}</b></span><input type="range" min="${rng(bB.memSamplerLimit, [1, 30])[0]}" max="${rng(bB.memSamplerLimit, [1, 30])[1]}" value="${bs.memSamplerLimit || 8}" aria-label="采样上限" id="wa-set-mslimit" class="wa-range"/></div>
        <div class="wa-set-row"><span>骰子面数 <b id="wa-set-msdicev">${bs.memSamplerDice || 10000}</b></span><input type="range" min="${rng(bB.memSamplerDice, [1000, 10000])[0]}" max="${rng(bB.memSamplerDice, [1000, 10000])[1]}" step="500" value="${bs.memSamplerDice || 10000}" aria-label="骰子面数" id="wa-set-msdice" class="wa-range"/></div>
        <label class="wa-node"><input type="checkbox" id="wa-set-msrel" ${bs.memSamplerRelevance !== 'off' ? 'checked' : ''}/><span class="wa-node-label">上下文相关召回（只注入当前剧情相关的人物记忆，关闭则全量采样）</span></label>
        <div class="wa-sec" data-wa-lane="story" data-wa-sec="自定义推演指令">自定义推演指令（追加到系统提示）</div>
        <textarea id="wa-set-custom" class="wa-ta" placeholder="例如：本世界魔法衰退，推演时注意时代背景…">${esc(bs.customInstruction)}</textarea>
        <button class="wa-btn" id="wa-set-save">保存推演设置</button>
        <div class="wa-sec" data-wa-lane="story" data-wa-sec="输出净化规则">输出净化规则（缝合 Veridis 规则引擎）</div>
        ${(() => {
          // v2.2.0: 规则治理口（此前 addRule/removeRule/setEnabled/loadPreset 全零调用，
          //   用户只能去 localStorage 手改 JSON —— 规则引擎有治理能力却无治理入口）
          if (!WA.purifier || typeof WA.purifier.stat !== 'function') return '<div class="wa-empty">净化模块未加载</div>';
          const ps = WA.purifier.stat();
          const rules = (WA.purifier.rules || []);
          const rows = rules.length ? rules.map((r, i) => `<div class="wa-item">
              <label class="wa-node"><input type="checkbox" data-prm-on="${esc(r.id)}" ${r.enabled !== false ? 'checked' : ''}/><span class="wa-node-label">${esc(r.name || r.id)}</span></label>
              <div class="wa-dim">find: ${esc(String(r.find || '').slice(0, 60))} → ${esc(String(r.replace || '（删）').slice(0, 24))}</div>
              <button class="wa-btn wa-mini" data-prm-del="${esc(r.id)}">删除</button></div>`).join('')
            : '<div class="wa-empty">无规则（净化不会做任何事）</div>';
          return rows + `<div class="wa-dim">共 ${rules.length} 条 · 已净化 ${ps.runs} 次（命中 ${ps.changed} · 省 ${ps.charsSaved} 字符 · 拦空 ${ps.blocked} · 规则错 ${ps.ruleErrors}）${ps.imported ? ' · 已导入 ' + ps.imported + ' 条' : ''}${ps.lastImport ? ' · 最近导入：' + esc(ps.lastImport) : ''}</div>`;
        })()}
        <div class="wa-row"><input id="wa-prm-find" class="wa-input" placeholder="正则 find（如 &lt;think&gt;[\\s\\S]*?&lt;/think&gt;）"/><input id="wa-prm-repl" class="wa-input wa-w60" placeholder="替换为（留空=删除）"/></div>
        <div class="wa-row"><button class="wa-btn wa-mini" id="wa-prm-add">新增规则</button><button class="wa-btn wa-mini" id="wa-prm-reset">恢复内置</button></div>
        <div class="wa-row"><button class="wa-btn wa-mini" id="wa-prm-import">导入预设 JSON</button></div>
        <textarea id="wa-prm-json" class="wa-ta" placeholder='粘贴 Veridis 预设或规则数组，如 [{"find":"…","replace":""}]'></textarea>
        <div id="wa-prm-out" class="wa-out"></div>
        <div class="wa-sec" data-wa-lane="world" data-wa-sec="区域突发事件">区域突发事件</div>
        ${(() => {
          // v2.7.0: 生效视图接入界面——`WA.regional.effectiveSettings` 自 v2.3.0 起存在，
          //   实现注释写的是「面板/诊断据此显示真实生效值」，但**全库产品代码零消费**
          //   （只有测试调用）：区域配置此前没有界面入口，只能靠 localStorage 手改，
          //   而手改出的越界值又被引擎夹取——界面上没有任何地方能看到「真正生效的数」。
          if (!WA.regional || typeof WA.regional.effectiveSettings !== 'function') return '<div class="wa-dim">区域引擎未加载</div>';
          const rg = WA.regional.effectiveSettings();
          const bd = (typeof WA.regional.bounds === 'function') ? WA.regional.bounds() : { chancePercent: [1, 100], durationRounds: [1, 20] };
          return `<label class="wa-node"><input type="checkbox" id="wa-rg-enable" ${rg.enabled ? 'checked' : ''}/><span class="wa-node-label">启用区域突发事件（按轮掷骰）</span></label>
            <div class="wa-set-row"><span>触发概率 <b id="wa-rg-chancev">${rg.chancePercent}%</b></span><input type="range" min="${bd.chancePercent[0]}" max="${bd.chancePercent[1]}" value="${rg.chancePercent}" aria-label="触发概率" id="wa-rg-chance" class="wa-range"/></div>
            <div class="wa-set-row"><span>持续轮次 <b id="wa-rg-durv">${rg.durationRounds}</b></span><input type="range" min="${bd.durationRounds[0]}" max="${bd.durationRounds[1]}" value="${rg.durationRounds}" aria-label="持续轮次" id="wa-rg-dur" class="wa-range"/></div>
            <button class="wa-btn" id="wa-rg-save">保存区域设置</button>
            <div id="wa-rg-out" class="wa-out"></div>
            <div class="wa-dim">此处显示的是<b>生效值</b>（越界存档已在保存时归一，落盘即引擎掷骰用的数）。</div>`;
        })()}
        <div class="wa-sec" data-wa-lane="world" data-wa-sec="舆情引擎">舆情引擎</div>
        <label class="wa-node"><input type="checkbox" id="wa-op-enable" ${op.enabled ? 'checked' : ''}/><span class="wa-node-label">启用舆情观察（新闻/论坛）</span></label>
        <label class="wa-node"><input type="checkbox" id="wa-op-sandbox" ${op.sandboxEnabled ? 'checked' : ''}/><span class="wa-node-label">启用闲逛沙盒（NON-CANON氛围碎片）</span></label>
        <div class="wa-set-row"><span>每N轮生成</span><input type="number" min="${rng(bO.everyNRounds, [1, 10])[0]}" max="${rng(bO.everyNRounds, [1, 10])[1]}" value="${op.everyNRounds}" aria-label="每N轮生成" id="wa-op-n" class="wa-input wa-w60"/></div>
        <div class="wa-row">
          <button class="wa-btn" id="wa-op-now">立即生成舆情</button>
          <button class="wa-btn" id="wa-sim-now">立即推演世界</button>
        </div>
        <div class="wa-sec" data-wa-lane="world" data-wa-sec="事件演化">事件演化（本地骰子）</div>
        <label class="wa-node"><input type="checkbox" id="wa-ev-dice" ${WA.evolution.getSettings().diceEnabled ? 'checked' : ''}/><span class="wa-node-label">启用事件链本地骰子推进</span></label>
        <div class="wa-set-row"><span>骰子修正 <b id="wa-ev-modv">${WA.evolution.getSettings().diceModifier}</b></span><input type="range" min="${rng(bE.diceModifier, [-30, 30])[0]}" max="${rng(bE.diceModifier, [-30, 30])[1]}" value="${WA.evolution.getSettings().diceModifier}" aria-label="骰子修正" id="wa-ev-mod" class="wa-range"/></div>
        <div class="wa-row"><button class="wa-btn" id="wa-ev-roll">立即掷一轮演化骰</button></div>
        <div id="wa-ev-out" class="wa-out"></div>
        <div class="wa-sec" data-wa-lane="world" data-wa-sec="远方近端随机事件">远方 / 近端随机事件（v2.3.0）</div>
        ${(() => {
          // v2.3.0 块3: 此前「开关/触发率/冷却/保底轮数」是 horizon 的模块常量 ——
          //   用户既不能关掉随机事件，也不能调触发率（一个会打断叙事的机制没有开关）。
          if (!WA.horizon || typeof WA.horizon.getSettings !== 'function') return '<div class="wa-empty">远方/近端引擎未加载</div>';
          const c = WA.horizon.getSettings();
          // v2.7.0: 区间边界取自引擎的单一真源（bounds）——此处此前硬编码 min/max，
          //   与 horizon 的 MIN_CHANCE_PCT/MAX_COOLDOWN/MIN_LEDGER 是同一组数的**第二份声明**：
          //   改一处忘一处就会出现「滑块能拖到的值被引擎夹掉」的静默不一致。
          const hb = (typeof WA.horizon.bounds === 'function') ? WA.horizon.bounds()
            : { chancePct: [1, 100], cooldown: [0, 20], ledger: [3, 30] };
          const st = WA.horizon.stat ? WA.horizon.stat() : null;
          const dis = v => (v === false ? 'disabled' : '');
          const dEn = c.distantEnabled !== false, nEn = c.nearEnabled !== false;
          const tail = st ? `<div class="wa-dim">本会话掷骰 ${st.rolls} 次 · 远方触发 ${st.distantFired} · 近端触发 ${st.nearFired} · 跳过（通道关） ${st.skipped}${st.lastReason ? ' · 最近：' + esc(st.lastReason) : ''}</div>` : '';
          // id 一律写成字面量（而非 `${k}-en` 式拼接）：守卫表靠源码字面量发现控件，
          //   拼接出的 id 运行时存在、静态守卫里隐形（会被报成僵尸或漏覆盖）。
          return `
            <label class="wa-node"><input type="checkbox" id="wa-hz-d-en" ${dEn ? 'checked' : ''}/><span class="wa-node-label">远方通道</span></label>
            <div class="wa-set-row"><span>触发率 <b id="wa-hz-d-chancev">${c.distantChance}</b>%</span><input type="range" min="${hb.chancePct[0]}" max="${hb.chancePct[1]}" value="${c.distantChance}" aria-label="触发率" id="wa-hz-d-chance" class="wa-range" ${dis(c.distantEnabled)}/></div>
            <div class="wa-set-row"><span>冷却 <b id="wa-hz-d-cdv">${c.distantCooldown}</b>轮</span><input type="range" min="${hb.cooldown[0]}" max="${hb.cooldown[1]}" value="${c.distantCooldown}" aria-label="冷却" id="wa-hz-d-cd" class="wa-range" ${dis(c.distantEnabled)}/></div>
            <div class="wa-set-row"><span>保底 <b id="wa-hz-d-ledgerv">${c.distantLedger}</b>轮</span><input type="range" min="${hb.ledger[0]}" max="${hb.ledger[1]}" value="${c.distantLedger}" aria-label="保底" id="wa-hz-d-ledger" class="wa-range" ${dis(c.distantEnabled)}/></div>
            <label class="wa-node"><input type="checkbox" id="wa-hz-n-en" ${nEn ? 'checked' : ''}/><span class="wa-node-label">近端通道</span></label>
            <div class="wa-set-row"><span>触发率 <b id="wa-hz-n-chancev">${c.nearChance}</b>%</span><input type="range" min="${hb.chancePct[0]}" max="${hb.chancePct[1]}" value="${c.nearChance}" aria-label="触发率" id="wa-hz-n-chance" class="wa-range" ${dis(c.nearEnabled)}/></div>
            <div class="wa-set-row"><span>冷却 <b id="wa-hz-n-cdv">${c.nearCooldown}</b>轮</span><input type="range" min="${hb.cooldown[0]}" max="${hb.cooldown[1]}" value="${c.nearCooldown}" aria-label="冷却" id="wa-hz-n-cd" class="wa-range" ${dis(c.nearEnabled)}/></div>
            <div class="wa-set-row"><span>保底 <b id="wa-hz-n-ledgerv">${c.nearLedger}</b>轮</span><input type="range" min="${hb.ledger[0]}" max="${hb.ledger[1]}" value="${c.nearLedger}" aria-label="保底" id="wa-hz-n-ledger" class="wa-range" ${dis(c.nearEnabled)}/></div>
            <div class="wa-dim">保底：连续未触发达该轮数即强制触发一次；关闭通道后连掷骰都不进行（不消耗冷却与保底计数）。</div>
            <div class="wa-row"><button class="wa-btn" id="wa-hz-save">保存随机事件设置</button></div><div id="wa-hz-out" class="wa-out"></div>`
            + tail;
        })()}
        <div id="wa-set-out" class="wa-out"></div>
        ${styleBlockHtml()}
        ${switchBlockHtml()}`;
    },
    bind(panelEl) {
      const $ = sel => panelEl.querySelector(sel);
      const out = () => $('#wa-set-out');
      // v2.21.0: 设置页结果出口的**判空写**。为什么必须收成单一出口：
      //   `out()` 每次调用都重新查询 —— 而本页有异步出口（舆情生成）在 `await` **之后**才写结果，
      //   其间任何一个状态事件（clock:changed / backstage:settled / 任意 STATE_EVENTS）都会让面板
      //   自动重绘、`#wa-set-out` 从树中消失 ⇒ 重查得 null ⇒ 写 `textContent` 抛
      //   `TypeError: Cannot set properties of null`。用户看到的是「点了没反应」，日志里是一条
      //   与页面无关的 DOM 报错（本仓库既有约定是「先取节点、判空再写」，见下方 pOut 的用法，
      //   但设置页主出口此前是唯一的例外）。此处把同一约定收成一个出口，杜绝再次分化。
      const setOut = function (text) { const o = out(); if (o) o.textContent = text; };
      // v2.257.0（V6 OPV6-1）：设置页顶部档位按钮。本处**只发动作** ——
      //   写盘、逐引擎复核、回滚栈、幂等判定全在 capability-tier 引擎里；
      //   面板唯一的职责是把引擎返回的原话摊给玩家（不另编措辞、不折成「已开启」）。
      const tierOutEl = () => $('#wa-set-tier-out');
      const tierRefresh = () => {
        // 切档后整页重绘（档位读数、按钮可点态、回滚按钮出现与否都要跟着变）。
        //   与上方 renderPruneRefresh 同口径：重绘即重建绑定，此处不手动修 DOM。
        try {
          if (WA.ui && WA.ui.mounted && typeof WA.uiSettings.render === 'function') {
            const body = panelEl.querySelector('.wa-body') || panelEl;
            if (body) { body.innerHTML = WA.uiSettings.render(); WA.uiSettings.bind(panelEl); }
          }
        } catch (e) { /* 重绘失败不改结论：动作已落盘，出口文本仍然正确 */ }
      };
      // 重绘会把出口节点整块换新（旧节点连同刚写进去的文本一起消失）——
      //   所以结果必须**先算好、重绘后再写**，否则玩家点了按钮只看到一片空白
      //   （本版专锁 D5b 当场抓到：档位真的切了，出口却读不到任何字）。
      const tierSay = function (text, refresh) {
        if (refresh) tierRefresh();
        const o = tierOutEl();
        if (o) o.textContent = text;
      };
      // v2.262.0（V6 OPV6-7）：玩家动线导航。**每次点击都重算一次显隐**（不缓存），
      //   因为设置页会被状态事件整块重绘 —— 重绘后上一轮的 display 全部丢失，
      //   而重绘用的 run 会把 lane 记在 `__laneSel` 上（模块级状态，重绘后仍生效）。
      const laneBody = () => (panelEl.querySelector('.wa-body') || panelEl);
      /**
       * 说明条：把当前动线的「段名清单 + 段数」写进 #wa-lane-note。
       *   `r` 是 laneApply 的真读数（不重新数一遍，避免两处口径又分家）。
       * 取段名走 data-wa-sec：它就是本版给每段补的第二个标注，此处是它的产品用途
       *   —— 不为了「门禁能采到」而标，标了要有人用。
       */
      const laneSayNote = function (lane, r) {
        const note = panelEl.querySelector('#wa-lane-note');
        if (!note) return;
        const dev = (WA.ui && typeof WA.ui.devMode === 'function') ? WA.ui.devMode() : false;
        const meta = LANES.filter(function (x) { return x.lane === lane; })[0];
        let names = [];
        try {
          names = Array.prototype.slice.call(laneBody().querySelectorAll('[data-wa-lane]'))
            .filter(function (el) { return el.getAttribute('data-wa-lane') === lane; })
            .map(function (el) { return el.getAttribute('data-wa-sec') || '（未命名段）'; });
        } catch (e) { names = []; }
        const head = (lane === 'all')
          ? ('全部：整页 ' + r.total + ' 段全显示（一个都不隐藏）')
          : ((meta ? meta.label : lane) + '：' + r.shown + ' 段' + (names.length ? '（' + names.join(' / ') + '）' : ''));
        note.innerHTML = head + (dev ? '　开发者模式下不隐藏任何东西。' : '');
      };
      const lanePaint = function (lane) {
        __laneSel = lane;
        const r = laneApply(laneBody(), lane);
        // 说明条跟着写：切到哪一路，就把「这一路有几段、都叫什么」写出来。
        //   这不只是提示文案 —— 它让「分组到底生效没」在界面上自证（玩家不必滚一屏去数），
        //   也是 laneApply 读数唯一的产品消费方（否则 shown/total 只有测试在读）。
        laneSayNote(lane, r);
        if (WA.log) WA.log('info', '设置页动线：' + lane + '（显示 ' + r.shown + ' / 隐藏 ' + r.hidden + ' / 共 ' + r.total + '）');
        return r;
      };
      panelEl.querySelectorAll('[data-wa-lane-go]').forEach(btn => {
        btn.onclick = function () { lanePaint(btn.getAttribute('data-wa-lane-go')); };
      });
      // 重绘后恢复上一次选中的动线（「原本就在某条动线里」不该被一次状态刷新踢回整页）
      if (__laneSel && __laneSel !== 'all') {
        laneSayNote(__laneSel, laneApply(laneBody(), __laneSel));
      }
      panelEl.querySelectorAll('[data-tier]').forEach(btn => {
        btn.onclick = function () {
          const nm = btn.getAttribute('data-tier');
          const o = tierOutEl();
          if (!WA.capabilityTier || typeof WA.capabilityTier.applyTier !== 'function') {
            if (o) o.textContent = '✗ 失败：档位引擎未加载（module-missing）';
            return;
          }
          let r = null;
          try { r = WA.capabilityTier.applyTier(nm); }
          catch (e) { if (o) o.textContent = '✗ 切换异常：' + ((e && e.message) || e); return; }
          if (!o) return;
          // 拒收码直译（只有这四个，其余按引擎原话走）——不另编措辞。
          const WHY = { 'bad-value': '档位名不认识', 'save-threw': '写盘失败', 'no-history': '没有可退回的档位', 'module-missing': '引擎未加载' };
          if (!r || r.ok === false) { o.textContent = '✗ 切换失败：' + (WHY[(r && r.reason)] || (r && r.reason) || '未知原因'); return; }
          if (r.noop) { o.textContent = '● 已是「' + nm + '」档，没有任何改动（不重复写盘、不重复计数）'; return; }
          // 部分成功就是部分成功：`notEffective` 逐条列名，绝不折成「已开启」。
          const ne = (r.notEffective || []);
          const head = (ne.length ? '⚠ 部分生效：' : '✓ 已切到「' + nm + '」档：')
            + '新开 ' + ((r.turnedOn || []).length) + ' 台、关回 ' + ((r.turnedOff || []).length) + ' 台';
          const tail = ne.length ? '｜以下 ' + ne.length + ' 台写了却没读回来：' + ne.join('、') + '（它们的开关可能被别的机制接管）' : '';
          tierSay(head + tail + '｜当前本档按住 ' + ((r.granted || []).length) + ' 台 · 可退回 ' + (r.rollbackDepth || 0) + ' 步', true);
        };
      });
      const tierRb = $('#wa-set-tier-rollback');
      if (tierRb) tierRb.onclick = function () {
        const o = tierOutEl();
        if (!WA.capabilityTier || typeof WA.capabilityTier.rollback !== 'function') {
          if (o) o.textContent = '✗ 失败：档位引擎未加载（module-missing）';
          return;
        }
        let r = null;
        try { r = WA.capabilityTier.rollback(); } catch (e) { if (o) o.textContent = '✗ 退回异常：' + ((e && e.message) || e); return; }
        if (!o) return;
        if (!r || r.ok === false) {
          const WHY = { 'bad-value': '档位记录损坏', 'save-threw': '写盘失败', 'no-history': '没有可退回的档位' };
          o.textContent = '✗ 退回失败：' + (WHY[(r && r.reason)] || (r && r.reason) || '未知原因');
          return;
        }
        const ne = (r.notEffective || []);
        tierSay('✓ 已退回「' + r.tier + '」档（从 ' + r.from + '）：新开 ' + ((r.turnedOn || []).length)
          + ' 台、关回 ' + ((r.turnedOff || []).length) + ' 台' + (ne.length ? '｜' + ne.length + ' 台未生效' : '')
          + '｜还剩 ' + (r.rollbackDepth || 0) + ' 步可退', true);
      };
      // v2.255.0 SIMPLIFY-NAV：开发者模式开关。写走 WA.ui.setDevMode 的单一写口
      //   （可见性 / 分类条 / 机制页弹回 / 落盘都在那边），本处只挂事件与留痕。
      //   关闭时若停在机制页，setDevMode 内部会 goPage('overview') → renderBody 重绘，
      //   设置页 DOM 被整块替换，此处的 devCb 节点随旧 DOM 一起失效 —— 这正是期望行为。
      const devCb = $('#wa-set-devmode');
      if (devCb) devCb.onchange = function () {
        const r = (WA.ui && typeof WA.ui.setDevMode === 'function') ? WA.ui.setDevMode(devCb.checked) : { ok: false, reason: 'ui-missing' };
        if (WA.log) WA.log('info', '开发者模式：' + (devCb.checked ? '开' : '关') + (r && r.ok === false ? '（失败：' + (r.reason || '?') + '）' : (r && r.page ? '（已回到概览页）' : '')));
      };
      // v2.2.0: 净化规则治理绑定（此前这些能力零调用 = 治理无入口）
      if (WA.purifier) {
        const pOut = () => { const o = $('#wa-prm-out'); return o; };
        panelEl.querySelectorAll('[data-prm-on]').forEach(cb => cb.onchange = () => {
          WA.purifier.setEnabled(cb.dataset.prmOn, cb.checked);
          if (WA.log) WA.log('info', '净化规则「' + cb.dataset.prmOn + '」已' + (cb.checked ? '启用' : '停用'));
        });
        panelEl.querySelectorAll('[data-prm-del]').forEach(btn => btn.onclick = () => {
          const r = WA.purifier.removeRuleSafe(btn.dataset.prmDel);
          const o = pOut(); if (o) o.textContent = r.ok ? '✓ 已删除，剩 ' + r.remaining + ' 条' : ('删除失败：' + r.reason);
          renderPruneRefresh();
        });
        const prmAdd = $('#wa-prm-add');
        if (prmAdd) prmAdd.onclick = () => {
          const r = WA.purifier.addRuleSafe({ find: $('#wa-prm-find').value, replace: $('#wa-prm-repl').value });
          const o = pOut(); if (o) o.textContent = r.ok ? '✓ 已新增规则（共 ' + r.total + ' 条）' : ('新增失败：' + r.reason);
          if (r.ok) renderPruneRefresh();
        };
        const prmReset = $('#wa-prm-reset');
        if (prmReset) prmReset.onclick = () => {
          const r = WA.purifier.resetToBuiltin();
          const o = pOut(); if (o) o.textContent = '✓ 已恢复内置规则（' + r.total + ' 条）';
          renderPruneRefresh();
        };
        const prmImp = $('#wa-prm-import');
        if (prmImp) prmImp.onclick = () => {
          const r = WA.purifier.importPresetSafe($('#wa-prm-json').value);
          const o = pOut(); if (o) o.textContent = r.ok ? ('✓ 导入 ' + r.added + ' 条' + (r.rejected ? '（拒收 ' + r.rejected + '：' + (r.reasons || []).join('、') + '）' : '')) : ('导入失败：' + r.reason);
          if (r.ok) renderPruneRefresh();
        };
      }
      function renderPruneRefresh() {
        try {
          if (typeof WA.uiSettings.render === 'function' && WA.ui && WA.ui.mounted) {
            const body = panelEl.querySelector('.wa-body');
            if (body && body.querySelector('#wa-prm-find')) { body.innerHTML = WA.uiSettings.render(); WA.uiSettings.bind(panelEl); }
          }
        } catch (e) {}
      }
      const npc = $('#wa-set-npc');
      if (npc) npc.oninput = () => { $('#wa-set-npcv').textContent = npc.value; };
      const bg = $('#wa-set-budget');
      const bgMode = $('#wa-set-budget-mode');
      const syncBudgetRow = () => {
        const mode = bgMode ? bgMode.value : 'auto';
        if (bg) bg.disabled = (mode !== 'manual');
        if ($('#wa-set-budgetv')) $('#wa-set-budgetv').textContent = mode === 'auto' ? '自动' : (mode === 'unlimited' ? '不限' : (bg ? bg.value + 't' : '—'));
      };
      if (bgMode) bgMode.onchange = syncBudgetRow;
      if (bg) bg.oninput = () => { if ($('#wa-set-budgetv') && (!$('#wa-set-budget-mode') || $('#wa-set-budget-mode').value === 'manual')) $('#wa-set-budgetv').textContent = bg.value + 't'; };
      syncBudgetRow();
      const msl = $('#wa-set-mslimit');
      if (msl) msl.oninput = () => { const v = $('#wa-set-mslimitv'); if (v) v.textContent = msl.value; };
      const msd = $('#wa-set-msdice');
      if (msd) msd.oninput = () => { const v = $('#wa-set-msdicev'); if (v) v.textContent = msd.value; };
      // v2.6.0（收口）: 写失败归因话术——**单一实现，提升到共同作用域**。
      //   为什么要提升（两处都踩过，留证防回退）：
      //     · 首版把 whyTxt 定义在 `saveBtn.onclick` 的**函数体内**，而 `#wa-hz-save`（远方/近端）
      //       在同一作用域的另一处引用它 ⇒ ReferenceError：主保存能用、另一个保存按钮一点就抛。
      //       能提前的作用域不要后置——定义在使用点之后、或在别的兄弟闭包里面，都是定时炸弹。
      //     · 反过来「在每个保存出口各写一份措辞」会立刻分叉成第二份真源（改一处忘一处）。
      //   本函数内共有三处用户可见的写入出口（主保存 / 远方近端 / 未来新增），故此处只留一份。
      const whyTxt = function (raw) {
        // 归因必须区分「环境问题」与「实现缺陷」：把 missing-key / stringify 这类编程错误显示成原始
        //   前缀，用户只会去清存储（或反复重试），永远修不好；反过来把配额问题说成「未知原因」也
        //   无从下手。两者给不同的下一步动作。
        const t = String(raw || '未知原因');
        if (/^missing-key/.test(t)) return '登记项未声明 key（实现缺陷，与存储空间无关）';
        if (/^stringify/.test(t)) return '设置值不可序列化（实现缺陷，与存储空间无关）';
        if (/^setItem/.test(t)) return t.replace(/^setItem:\s*/, '') + '（存储写入被拒：配额已满/隐私模式等）';
        return t;
      };
      // v2.265.0（V6 EXV6-1）：世界日记设置绑定。
      //   两条与上面 wa-set-save 同规：写盘只走引擎的 setSettings（唯一写路径）；
      //   回显按真实结果（ok:false 就报失败，不无条件报「已保存」）。
      const wdMl = $('#wa-wd-maxlines');
      if (wdMl) wdMl.oninput = () => { const v = $('#wa-wd-maxlinesv'); if (v) v.textContent = wdMl.value; };
      const wdSave = $('#wa-wd-save');
      if (wdSave) wdSave.onclick = () => {
        const wdOutEl = $('#wa-wd-out');
        const say = function (t) { if (wdOutEl) wdOutEl.textContent = t; };
        if (!WA.worldDiary || typeof WA.worldDiary.setSettings !== 'function') { say('✗ 保存失败：世界日记模块未加载'); return; }
        const en = $('#wa-wd-enable'), off = $('#wa-wd-offline');
        const r = WA.worldDiary.setSettings({
          enabled: en ? !!en.checked : true,
          maxLines: +((wdMl && wdMl.value) || 3) || 3,
          includeOffline: off ? !!off.checked : true
        });
        if (r && r.ok === false) { say('✗ 保存失败：' + (r.reason || '未落盘') + '（改动未生效）'); return; }
        const now = WA.worldDiary.getSettings();
        say('✓ 已保存（每屏 ' + now.maxLines + ' 句' + (now.enabled ? '' : ' · 概览页已隐藏') + (now.includeOffline ? '' : ' · 不含离线段') + '）');
        // 概览页要立刻反映新设置：当前若停在别的页，切过去时才重绘，不必强刷
      };
      // v2.266.0（V6 EXV6-2）：人物动线设置绑定。与 wa-wd-save 同规。
      const drMp = $('#wa-dr-maxp');
      if (drMp) drMp.oninput = () => { const v = $('#wa-dr-maxpv'); if (v) v.textContent = drMp.value; };
      const drSave = $('#wa-dr-save');
      if (drSave) drSave.onclick = () => {
        const drOutEl = $('#wa-dr-out');
        const say = function (t) { if (drOutEl) drOutEl.textContent = t; };
        if (!WA.dayRoute || typeof WA.dayRoute.setSettings !== 'function') { say('✗ 保存失败：人物动线模块未加载'); return; }
        const en = $('#wa-dr-enable'), nx = $('#wa-dr-next'), hp = $('#wa-dr-hideplace');
        const r = WA.dayRoute.setSettings({
          enabled: en ? !!en.checked : true,
          maxPeople: +((drMp && drMp.value) || 3) || 3,
          showNext: nx ? !!nx.checked : true,
          hidePlace: hp ? !!hp.checked : false
        });
        if (r && r.ok === false) { say('✗ 保存失败：' + (r.reason || '未落盘') + '（改动未生效）'); return; }
        const now = WA.dayRoute.getSettings();
        say('✓ 已保存（最多 ' + now.maxPeople + ' 人' + (now.enabled ? '' : ' · 概览页已隐藏') + (now.showNext ? '' : ' · 不含预告段') + (now.hidePlace ? ' · 不报地名' : '') + '）');
      };
      // v2.267.0（V6 EXV6-3）：关系温度计设置绑定。
      const rtMp = $('#wa-rt-maxp');
      if (rtMp) rtMp.oninput = () => { const v = $('#wa-rt-maxpv'); if (v) v.textContent = rtMp.value; };
      const rtSave = $('#wa-rt-save');
      if (rtSave) rtSave.onclick = () => {
        const out = $('#wa-rt-out');
        const say = (msg) => { if (out) { out.textContent = msg; setTimeout(() => { if (out && out.textContent === msg) out.textContent = ''; }, 3500); } };
        if (!WA.relationTemp || typeof WA.relationTemp.setSettings !== 'function') {
          say('✗ 关系温度计引擎未加载');
          return;
        }
        const en = $('#wa-rt-enable'), typ = $('#wa-rt-types'), rsn = $('#wa-rt-reason');
        const next = {
          enabled: !!(en && en.checked),
          maxPeople: rtMp ? (parseInt(rtMp.value, 10) || 4) : 4,
          showTypes: !!(typ && typ.checked),
          showReason: !!(rsn && rsn.checked)
        };
        const r = WA.relationTemp.setSettings(next);
        if (r && r.ok === false) { say('✗ 保存失败：' + (r.reason || '设置被拒')); return; }
        const now = WA.relationTemp.getSettings();
        say('✓ 已保存（最多 ' + now.maxPeople + ' 人' + (now.enabled ? '' : ' · 概览页已隐藏') + (now.showTypes ? '' : ' · 不带六型') + (now.showReason ? '' : ' · 不带原因') + '）');
      };
      // v2.268.0（V6 EXV6-4）：暗流日历设置绑定。与 wa-rt-save 同规。
      const ucHz = $('#wa-uc-hz'), ucMax = $('#wa-uc-max');
      if (ucHz) ucHz.oninput = () => { const v = $('#wa-uc-hzv'); if (v) v.textContent = ucHz.value; };
      if (ucMax) ucMax.oninput = () => { const v = $('#wa-uc-maxv'); if (v) v.textContent = ucMax.value; };
      const ucSave = $('#wa-uc-save');
      if (ucSave) ucSave.onclick = () => {
        const out = $('#wa-uc-out');
        const say = (msg) => { if (out) { out.textContent = msg; setTimeout(() => { if (out && out.textContent === msg) out.textContent = ''; }, 3500); } };
        if (!WA.undercurrentCalendar || typeof WA.undercurrentCalendar.setSettings !== 'function') {
          say('✗ 暗流日历引擎未加载');
          return;
        }
        const en = $('#wa-uc-enable'), hd = $('#wa-uc-hidden');
        const next = {
          enabled: !!(en && en.checked),
          horizonDays: ucHz ? (parseInt(ucHz.value, 10) || 3) : 3,
          maxItems: ucMax ? (parseInt(ucMax.value, 10) || 4) : 4,
          showHidden: !!(hd && hd.checked)
        };
        const r = WA.undercurrentCalendar.setSettings(next);
        if (r && r.ok === false) { say('✗ 保存失败：' + (r.reason || '设置被拒')); return; }
        const now = WA.undercurrentCalendar.getSettings();
        say('✓ 已保存（向前 ' + now.horizonDays + ' 天 · 最多 ' + now.maxItems + ' 条'
          + (now.enabled ? '' : ' · 概览页已隐藏')
          + (now.showHidden ? ' · 透视隐秘' : ' · 隐藏暗流脱敏') + '）');
      };
      // v2.269.0（V6 EXV6-5）：单轮成本卡设置绑定。与 wa-uc-save 同规。
      const rcTop = $('#wa-rc-topn');
      if (rcTop) rcTop.oninput = () => { const v = $('#wa-rc-topnv'); if (v) v.textContent = rcTop.value; };
      const rcSave = $('#wa-rc-save');
      if (rcSave) rcSave.onclick = () => {
        const out = $('#wa-rc-out');
        const say = (msg) => { if (out) { out.textContent = msg; setTimeout(() => { if (out && out.textContent === msg) out.textContent = ''; }, 3500); } };
        if (!WA.roundCost || typeof WA.roundCost.setSettings !== 'function') {
          say('✗ 单轮成本卡引擎未加载');
          return;
        }
        const en = $('#wa-rc-enable'), tm = $('#wa-rc-timing'), lt = $('#wa-rc-longtrend');
        const next = {
          enabled: !!(en && en.checked),
          topN: rcTop ? (parseInt(rcTop.value, 10) || 4) : 4,
          showTiming: !!(tm && tm.checked),
          showLongTrend: !!(lt && lt.checked)
        };
        const r = WA.roundCost.setSettings(next);
        if (r && r.ok === false) { say('✗ 保存失败：' + (r.reason || '设置被拒')); return; }
        const now = WA.roundCost.getSettings();
        say('✓ 已保存（榜单 ' + now.topN + ' 条'
          + (now.enabled ? '' : ' · 概览页已隐藏')
          + (now.showTiming ? ' · 带耗时' : ' · 不带耗时')
          + (now.showLongTrend ? ' · 带长期趋势' : ' · 只报本轮') + '）');
      };
      // v2.270.0（V6 EXV6-6）：存档体检设置绑定。
      //   ⚠ 两个上游开关走**各自引擎**的 setSettings（本模块自己不写别人的键）；
      //     四个写调用都必须真发生并复核读回 —— 这是「档位不是开关」那条纪律的最小形态。
      const shWarn = $('#wa-sh-warn'), shUrgent = $('#wa-sh-urgent');
      if (shWarn) shWarn.oninput = () => { const v = $('#wa-sh-warnv'); if (v) v.textContent = shWarn.value; };
      if (shUrgent) shUrgent.oninput = () => { const v = $('#wa-sh-urgentv'); if (v) v.textContent = shUrgent.value; };
      const shSave = $('#wa-sh-save');
      if (shSave) shSave.onclick = () => {
        const out = $('#wa-sh-out');
        const say = (msg) => { if (out) { out.textContent = msg; setTimeout(() => { if (out && out.textContent === msg) out.textContent = ''; }, 4000); } };
        if (!WA.saveHealth || typeof WA.saveHealth.setSettings !== 'function') {
          say('✗ 存档体检引擎未加载');
          return;
        }
        const en = $('#wa-sh-enable'), fc = $('#wa-sh-forecaster'), wl = $('#wa-sh-waterline');
        const next = {
          enabled: !!(en && en.checked),
          warnRounds: shWarn ? (parseInt(shWarn.value, 10) || 40) : 40,
          urgentRounds: shUrgent ? (parseInt(shUrgent.value, 10) || 8) : 8
        };
        const r = WA.saveHealth.setSettings(next);
        if (r && r.ok === false) { say('✗ 体检设置保存失败：' + (r.reason || '被拒')); return; }
        // 两个上游：逐个真调、逐个复核读回；部分成功就报部分成功
        const parts = [];
        if (WA.storageForecast && typeof WA.storageForecast.setSettings === 'function') {
          const want = !!(fc && fc.checked);
          WA.storageForecast.setSettings({ enabled: want });
          parts.push('趋势面 ' + (WA.storageForecast.getSettings().enabled === want ? (want ? '已开' : '已关') : '未生效'));
        } else { parts.push('趋势面 模块缺席'); }
        if (WA.capacityAudit && typeof WA.capacityAudit.setSettings === 'function') {
          const want2 = !!(wl && wl.checked);
          WA.capacityAudit.setSettings({ enabled: want2 });
          parts.push('水位面 ' + (WA.capacityAudit.getSettings().enabled === want2 ? (want2 ? '已开' : '已关') : '未生效'));
        } else { parts.push('水位面 模块缺席'); }
        const now = WA.saveHealth.getSettings();
        say('✓ 已保存（提示线 ' + now.warnRounds + ' 轮 · 紧急线 ' + now.urgentRounds + ' 轮'
          + (now.enabled ? '' : ' · 概览页已隐藏') + '；' + parts.join(' · ') + '）');
      };
      // v2.271.0（V6 EXV6-7）：开局引导设置绑定 + 三个按钮（保存 / 重新显示 / 清空进度）。
      //   ⚠ 这里有一条**必须真调的写**：手勾确认走 `WA.firstRun.mark()`（它内部会先判
      //     「环境判得出吗」，判得出时**拒绝写入**并说明）。面板不许绕过它直接写设置族 ——
      //     绕过就等于把「环境优先」这条纪律拆了。
      // 面板内存里保存最近一次打好的包（复原按钮读它；不落世界、不落设置族）。
      let __hpLastPack = null;
      const frSave = $('#wa-fr-save');
      if (frSave) frSave.onclick = () => {
        const out = $('#wa-fr-out');
        const say = (msg) => { if (out) { out.textContent = msg; setTimeout(() => { if (out && out.textContent === msg) out.textContent = ''; }, 4000); } };
        if (!WA.firstRun || typeof WA.firstRun.setSettings !== 'function') { say('✗ 开局引导引擎未加载'); return; }
        const en = $('#wa-fr-enable'), sd = $('#wa-fr-showdone'), tk = $('#wa-fr-talk');
        const r = WA.firstRun.setSettings({
          enabled: !!(en && en.checked),
          showWhenDone: !!(sd && sd.checked)
        });
        if (r && r.ok === false) { say('✗ 保存失败：' + (r.reason || '被拒')); return; }
        // 手勾走 mark()：环境判得出时它会拒绝，我们要把拒绝原因**原样**转告玩家
        let mk = '';
        if (tk) {
          const mr = WA.firstRun.mark('talk', !!tk.checked);
          mk = mr && mr.ok === false
            ? ('；手勾未生效（' + (mr.note || mr.reason) + '）')
            : ('；手勾已记录');
        }
        const now = WA.firstRun.getSettings();
        say('✓ 已保存（' + (now.enabled ? '已启用' : '已停用')
          + (now.showWhenDone ? ' · 做完也保留' : '') + mk + '）');
      };
      const frResume = $('#wa-fr-resume');
      if (frResume) frResume.onclick = () => {
        const out = $('#wa-fr-out');
        if (WA.firstRun && typeof WA.firstRun.resume === 'function') WA.firstRun.resume();
        if (out) out.textContent = '✓ 引导已重新显示（回概览页看）';
      };
      const frReset = $('#wa-fr-reset');
      if (frReset) frReset.onclick = () => {
        const out = $('#wa-fr-out');
        if (WA.firstRun && typeof WA.firstRun.resetAll === 'function') WA.firstRun.resetAll();
        if (out) out.textContent = '✓ 进度已清空（环境读数不受影响）';
      };
      // v2.273.0（V6 EXV6-9）：一键交班三钮。
      //   ⚠ 三钮的职责必须分开，不许合并：
      //     · 保存：只写本模块的 include* 设置（不打包、不动别的引擎）；
      //     · 打包并校验：pack() + verify()，把**缺哪块、为什么**直接说给玩家；
      //     · 复原：restore()，逐块真调各模块导入口，并把「哪块成了 / 哪块没成」原样转告。
      //   合并成一个「一键」按钮会把「设置没存上」与「包复不出来」两种失败混成一个提示。
      const hpSave = $('#wa-hp-save');
      if (hpSave) hpSave.onclick = () => {
        const out = $('#wa-hp-out');
        const say = (msg) => { if (out) { out.textContent = msg; setTimeout(() => { if (out && out.textContent === msg) out.textContent = ''; }, 4500); } };
        if (!WA.handoffPack || typeof WA.handoffPack.setSettings !== 'function') { say('✗ 一键交班引擎未加载'); return; }
        const r = WA.handoffPack.setSettings({
          enabled: !!($('#wa-hp-enable') && $('#wa-hp-enable').checked),
          includeBlueprint: !!($('#wa-hp-bp') && $('#wa-hp-bp').checked),
          includeRules: !!($('#wa-hp-rules') && $('#wa-hp-rules').checked),
          includeTier: !!($('#wa-hp-tier') && $('#wa-hp-tier').checked),
          includeTheme: !!($('#wa-hp-theme') && $('#wa-hp-theme').checked)
        });
        if (r && r.ok === false) { say('✗ 保存失败：' + (r.reason || '被拒')); return; }
        const now = WA.handoffPack.getSettings();
        say('✓ 已保存（' + (now.enabled ? '已启用' : '已停用') + '；收进 '
          + [now.includeBlueprint !== false ? '世界结构' : '', now.includeRules !== false ? '规则包' : '',
             now.includeTier !== false ? '档位' : '', now.includeTheme !== false ? '题材' : '']
            .filter(function (x) { return x; }).join(' / ') + '）');
      };
      const hpPack = $('#wa-hp-pack');
      if (hpPack) hpPack.onclick = () => {
        const out = $('#wa-hp-out');
        const say = (msg) => { if (out) { out.textContent = msg; } };
        if (!WA.handoffPack || typeof WA.handoffPack.pack !== 'function') { say('✗ 一键交班引擎未加载'); return; }
        const p = WA.handoffPack.pack();
        if (!p || p.ok !== true) { say('✗ 打包失败：' + ((p && p.reason) || '未知')); return; }
        const v = WA.handoffPack.verify(p);
        // 面板自己保存这一份（复原按钮要读它；不进世界、不进设置族）
        __hpLastPack = p;
        const miss = (p.missing || []).map(function (m) { return m.label + '(' + m.why + ')'; }).join('、');
        // v2.274.0：把 suggest() 的「下一步 + 复原顺序」一并念出来。
        //   此前 suggest 是 self-only 死导出（pack/verify/restore 都被消费、只有它零消费），
        //   而它答的恰恰是「缺块该去哪开」「先复哪块」——玩家点完打包最需要的两句。
        //   ⚠ 不代替玩家动手：只排顺序与给出口，绝不替它把开关打开。
        const sg = (typeof WA.handoffPack.suggest === 'function') ? WA.handoffPack.suggest(p) : null;
        const sgText = (sg && sg.ok && sg.rows && sg.rows.length)
          ? '　下一步：' + sg.rows.map(function (x) { return x.text; }).join('；')
          : '';
        say('打包完成：' + Object.keys(p.blocks || {}).length + ' 块'
          + (p.complete ? '（齐全）' : '（缺：' + miss + '）')
          + ' · 可复原性：' + ((v && v.verdict) || '未知') + sgText);
      };
      const hpRestore = $('#wa-hp-restore');
      if (hpRestore) hpRestore.onclick = () => {
        const out = $('#wa-hp-out');
        const say = (msg) => { if (out) { out.textContent = msg; } };
        if (!WA.handoffPack || typeof WA.handoffPack.restore !== 'function') { say('✗ 一键交班引擎未加载'); return; }
        if (!__hpLastPack) { say('✗ 先点「打包并校验」拿到一份包，再复原（不替你凭空造一份）'); return; }
        const r = WA.handoffPack.restore(__hpLastPack);
        say((r && r.ok ? '✓ ' : '△ ') + ((r && r.note) || (r && r.reason) || '未知'));
      };
      const saveBtn = $('#wa-set-save');
      if (saveBtn) saveBtn.onclick = () => {
        const wMain = WA.backstage.setSettings({
          simulationMode: $('#wa-set-mode').value,
          timePolicy: $('#wa-set-time').value,
          pulseActivity: $('#wa-set-pulse').value,
          npcBudget: +npc.value,
          autoSimulate: $('#wa-set-auto').checked,
          fullRules: $('#wa-set-fullrules').checked,
          syncToChat: $('#wa-set-sync') ? $('#wa-set-sync').checked : false,
          autoBackup: $('#wa-set-autobak') ? $('#wa-set-autobak').checked : false,
          injectBudget: (() => { const m = $('#wa-set-budget-mode'); const v = m ? m.value : 'auto'; if (v === 'unlimited') return 0; if (v === 'manual') return Math.max(200, +($('#wa-set-budget') ? $('#wa-set-budget').value : 2400) || 2400); return -1; })(),
          memSamplerLimit: +($('#wa-set-mslimit') ? $('#wa-set-mslimit').value : 8) || 8,
          memSamplerDice: +($('#wa-set-msdice') ? $('#wa-set-msdice').value : 10000) || 10000,
          memSamplerRelevance: $('#wa-set-msrel') && $('#wa-set-msrel').checked ? 'on' : 'off',
          customInstruction: $('#wa-set-custom').value.trim()
        });
        const wOp = WA.opinion.setSettings({ enabled: $('#wa-op-enable').checked, sandboxEnabled: $('#wa-op-sandbox').checked, everyNRounds: +$('#wa-op-n').value || 3 });
        // v2.6.0: 保存结果必须回显——此前这里恒报「✓ 设置已保存」，而底层 save() 失败时
        //   用户看到的是成功提示、磁盘上却什么都没变（配额满/隐私模式），下次打开发现配置回退
        //   且完全无从判断是自己没保存还是被环境吞了。改为按 writeStat 的真实结果给话术。
        const ws2 = (WA.settingsBus && WA.settingsBus.writeStat) ? WA.settingsBus.writeStat() : null;
        //   两条判据都要看：① 本次调用的回传结果（最精确）；② 写入台账最近失败（兜住
        //   「回传被吞」的路径）。两者任一为失败即报失败，绝不无条件报成功。
        const badW = [wMain, wOp].filter(function (x) { return x && x.ok === false; })[0];
        if (badW) setOut('✗ 保存失败：' + whyTxt(badW.reason) + '（改动未落盘）');
        else if (ws2 && ws2.lastError) setOut('✗ 保存失败：' + whyTxt(ws2.lastError) + '（改动未落盘）');
        else setOut('✓ 设置已保存');
      };
      const opNow = $('#wa-op-now');
      if (opNow) opNow.onclick = async () => { setOut('舆情生成中…'); const r = await WA.opinion.generate(); setOut(r.ok ? `✓ 新闻${r.news}条 论坛${r.forums}主题` : ('失败：' + r.reason)); };
      const simNow = $('#wa-sim-now');
      if (simNow) simNow.onclick = () => { WA.backstage.forceSimulate(); setOut('已触发世界推演（见日志）'); };
      // 演化设置
      const evMod = $('#wa-ev-mod');
      if (evMod) evMod.oninput = () => { $('#wa-ev-modv').textContent = evMod.value; };
      // v2.3.0 块3: 远方/近端通道配置绑定（含「关闭 ⇒ 概率/冷却控件禁用」的可见降级）
      // ⚠ 选择器必须带 '#'：`$('wa-hz-d-en')` 是**标签名**选择器（找 <wa-hz-d-en> 元素），
      //   永远返回 null，绑定会静默失效（控件渲染正常、参数却不联动、滑块不回显）。
      const byId = id => $('#' + id);
      const hzIds = ['wa-hz-d', 'wa-hz-n'];
      hzIds.forEach(k => {
        const pair = { en: byId(k + '-en'), ch: byId(k + '-chance'), cd: byId(k + '-cd'), lg: byId(k + '-ledger') };
        const sync = () => {
          const on = (pair.en || {}).checked !== false;
          [pair.ch, pair.cd, pair.lg].forEach(el => { if (el) el.disabled = !on; });
        };
        if (pair.en) pair.en.onchange = sync;
        if (pair.ch) pair.ch.oninput = () => { const v = byId(k + '-chancev'); if (v) v.textContent = pair.ch.value; };
        if (pair.cd) pair.cd.oninput = () => { const v = byId(k + '-cdv'); if (v) v.textContent = pair.cd.value; };
        if (pair.lg) pair.lg.oninput = () => { const v = byId(k + '-ledgerv'); if (v) v.textContent = pair.lg.value; };
        sync();
      });
      const hzSave = $('#wa-hz-save');
      if (hzSave) hzSave.onclick = () => {
        const wHz = WA.horizon.setSettings({
          distantEnabled: $('#wa-hz-d-en').checked, distantChance: +$('#wa-hz-d-chance').value, distantCooldown: +$('#wa-hz-d-cd').value, distantLedger: +$('#wa-hz-d-ledger').value,
          nearEnabled: $('#wa-hz-n-en').checked, nearChance: +$('#wa-hz-n-chance').value, nearCooldown: +$('#wa-hz-n-cd').value, nearLedger: +$('#wa-hz-n-ledger').value
        });
        const o = $('#wa-hz-out');
        // v2.6.0: 与主保存同规格——写失败不得再报「✓ 已保存」；归因话术也复用同一处
        //   （whyTxt 与主保存定义在同一作用域内，避免「两条保存路径两套措辞」的第二份真源）。
        if (o) o.textContent = (wHz && wHz.ok === false)
          ? ('✗ 保存失败：' + whyTxt(wHz.reason) + '（改动未落盘）')
          : '✓ 已保存（写入即归一：概率 1-100%、冷却 0-20 轮、保底 3-30 轮——落盘的就是生效值）';
      };
      // v2.7.0: 区域突发事件配置绑定（与 horizon 的 hzSave 同规格——同一条写入出口、同一套话术）
      const rgIds = ['wa-rg-chance', 'wa-rg-dur'];
      rgIds.forEach(function (id) {
        const el = byId(id);
        const val = byId(id + 'v');
        if (el && val) el.oninput = function () { val.textContent = el.value + (id === 'wa-rg-chance' ? '%' : ''); };
      });
      const rgSave = byId('wa-rg-save');
      if (rgSave) rgSave.onclick = function () {
        const wRg = WA.regional.setSettings({
          enabled: byId('wa-rg-enable').checked,
          chancePercent: +byId('wa-rg-chance').value,
          durationRounds: +byId('wa-rg-dur').value
        });
        const o = byId('wa-rg-out');
        // 与主保存/远方近端同规格：写失败不得报成功；归因话术复用同一处 whyTxt（单一实现）
        if (o) o.textContent = (wRg && wRg.ok === false)
          ? ('✗ 保存失败：' + whyTxt(wRg.reason) + '（改动未落盘）')
          : '✓ 已保存（写入即归一：概率 1-100%、持续 1-20 轮，落盘的就是生效值）';
      };
      const evRoll = $('#wa-ev-roll');
      if (evRoll) evRoll.onclick = () => {
        WA.evolution.setSettings({ diceEnabled: $('#wa-ev-dice').checked, diceModifier: +evMod.value });
        const results = WA.evolution.tick();
        $('#wa-ev-out').innerHTML = results.length ? results.map(r => `<div class="wa-item">${esc(r.name)}：<b>${esc(r.result)}</b> ${r.stage ? '→ ' + esc(r.stage) : ''} ${r.dice ? '(骰' + r.dice + '/阈' + r.threshold + ')' : ''}</div>`).join('') : '<div class="wa-dim">（无活跃事件链，可在backstage推演中生成）</div>';
      };
      // v2.51.0（第三十六面）: 叙事工艺保存出口。三点与既有保存出口同规格，一点为本块独有：
      //   同规格 → ① 写失败不得报成功（`ok === false` 才走失败分支）；② 归因话术复用
      //     同一处 `whyTxt`（不新增第二份措辞真源）；③ 失败时明说「改动未落盘」。
      //   独有 → ④ **必须回显注入可见性**。本块在 render SOURCES 里的默认值是 false
      //      （老用户凭空多约束 = 静默行为变更，故默认关），因此「保存成功了但正文没变」
      //      是这个面最可能被问的问题。不回显这一句，用户只会得到与 v2.38.0 `echoes`
      //      复选框「点了零效果」完全同形的体验——本版新增出口不得再犯该型病。
      const stSave = byId('wa-st-save');
      if (stSave) stSave.onclick = function () {
        const o = byId('wa-st-out');
        if (!WA.style || typeof WA.style.setSettings !== 'function') { if (o) o.textContent = '✗ 保存失败：叙事工艺模块未加载（engines/style.js）'; return; }
        const wSt = WA.style.setSettings({
          block: byId('wa-st-block').checked ? 'on' : 'off',
          paragraphStyle: byId('wa-st-para').value,
          perspective: byId('wa-st-persp').value,
          userPronoun: byId('wa-st-pron').value,
          takeover: byId('wa-st-takeover').value,
          narrate: byId('wa-st-narrate').value,
          custom: byId('wa-st-custom').value.trim()
        });
        if (!o) return;
        if (wSt && wSt.ok === false) {
          // 非法档位是「整笔拒收」语义（磁盘上不留一半新一半旧的中间态），故这里必须把
          //   被拒的轴原样带出来——否则用户看到「保存失败」却不知道哪一轴不合法。
          const bad = (wSt.bad || []).map(function (b) { return (b.axis || '?') + '=' + b.got; }).join('、');
          o.textContent = '✗ 保存失败：' + whyTxt(wSt.reason) + (bad ? '（非法档位：' + bad + '）' : '') + '（改动未落盘）';
          return;
        }
        const eff = (typeof WA.style.effectiveSettings === 'function') ? WA.style.effectiveSettings() : {};
        const axN = Object.keys(eff).filter(function (k) { return k !== 'enabled'; }).length;
        const vis = (WA.render && typeof WA.render.getVisibility === 'function') ? WA.render.getVisibility() : {};
        const visOn = !!vis.style;
        o.textContent = '✓ 已保存（' + (typeof WA.style.summaryText === 'function' ? WA.style.summaryText() : '') + '）'
          + '｜生效轴 ' + axN + ' 项'
          + (visOn ? '｜注入可见性：已开启（下轮注入生效）' : '｜注入可见性：**未开启** —— 需到「导演」页开启「叙事工艺」源，否则不进正文');
      };
      switchBind(panelEl);
      /* E7：天气→灾害联动开关。专用绑定，不走通用通道（见 switchBlockHtml 里的理由）。 */
      const hzwx = panelEl.querySelector('[data-hzwx]');
      if (hzwx) {
        hzwx.onchange = function () {
          const o = panelEl.querySelector('#wa-sw-out');
          const hz = WA.hazard;
          if (!hz || typeof hz.setSettings !== 'function') { if (o) o.textContent = '✗ 模块未装载：hazard'; return; }
          let w = null;
          try { w = hz.setSettings({ weatherLink: !!hzwx.checked }); }
          catch (e) { if (o) o.textContent = '✗ 保存异常：' + ((e && e.message) || e); return; }
          if (o) {
            o.textContent = (w && w.ok === false)
              ? ('✗ 保存失败：' + (w.reason || '未知原因') + '（改动未落盘）')
              : ('✓ 天气造灾害已' + (hzwx.checked ? '开启' : '关闭')
                + (hzwx.checked && !hz.getSettings().enabled
                  ? '（⚠ 累积风险总开关仍是关闭 —— 联动不会生效，请打开「开关」组里的累积风险）' : ''));
          }
        };
      }
    }
  };
})();