/**
 * WorldAxis engines/theme.js (v2.87.0) — 题材规则组合（B7）
 *
 * 治的病：**题材无处安放**。
 *   engines/rules.js 有 16 个规则模块（world/event/faction/wind/…/protocol），
 *   backstage.buildPrompt 只有两档：全量（getAll）或精简（coreSummary）。
 *   于是「我这一局是都市恋爱，不要奇幻模块」只能靠人肉改源码或整局忍受。
 *   本模块把题材做成对 ORDER 的**显式组合**：装/卸题材只改顺序表，不改任何正文。
 *
 * 三条口径：
 *   ① **组合是叠加的**：多个题材可同时启用（都市 + 悬疑），模块取并集并按 ORDER 原序。
 *      不引入优先级、不做「后者覆盖前者」——覆盖式合并会让「谁赢了」不可预测。
 *   ② **预览不覆盖**：preview() 纯计算（模块数 / 字数 / 相对当前的差异），不写设置。
 *      用户看到结果才决定 apply，预览本身不留任何痕迹。
 *   ③ **未知题材不静默**：enable(name) 对不认识的题材返回 false + reason，
 *      不当作空集悄悄接受（空集会让「启用了」与「没启用」长得一样）。
 *
 * 职责分离（B7 第三项）：见 separation()。三插件各司其职，缺席时**降级可见**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_theme_settings_v1';
  // v2.258.0（OPV6-3）：`engines` 记**本模块自己打开的**引擎（判据与 capabilityTier.granted 同构：
  //   只有「返回 'on' 的那一次」才算，'already' 不算）。为什么要记：题材切走时要把自己开的收回去，
  //   而**只能收回自己开的** —— 玩家手动开的、档位开的，一次都不许被题材关掉。
  const DEF = { themes: [], engines: [] };
  const __REG = { key: LS_KEY, def: DEF, module: 'theme', bounds: {} };
  // 题材 = 模块的显式组合。核模块（world/event/info/reputation）不入任何题材的排除面，
  //   它们是「世界非中心化」的承重墙，卸掉就没有世界可言。
  const CORE = ['world', 'event', 'info', 'reputation'];
  const THEMES = {
    urban: { label: '都市', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'enemy', 'regional', 'persona', 'relation', 'craft', 'protocol'] },
    campus: { label: '校园', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'persona', 'relation', 'craft', 'protocol'] },
    mystery: { label: '悬疑', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'enemy', 'blackbox', 'regional', 'persona', 'relation', 'craft', 'protocol'] },
    fantasy: { label: '奇幻', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'enemy', 'regional', 'blackbox', 'trends', 'persona', 'relation', 'craft', 'protocol'] },
    business: { label: '经营', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'regional', 'trends', 'persona', 'relation', 'craft', 'protocol'] },
    // ── v2.231.0（优化 OPT-8）：四个扩展题材 ────────────────────────────────
    //   进的是**真源本身**（不是别处另存一份）：`known()` / `compose()` / `apply()`
    //   读的都是本表，题材不在表里，apply 就静默忽略它 —— 于是「配方的题材集合」与
    //   「实际组合出来的模块」当场分叉，而两边各自都报成功。
    //   模块清单按各自题材的语义取：科幻含 trends（趋势），仙侠含 blackbox（天机不可知）。
    modern: { label: '现代', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'persona', 'relation', 'craft', 'protocol'] },
    history: { label: '历史', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'enemy', 'regional', 'persona', 'relation', 'craft', 'protocol'] },
    scifi: { label: '科幻', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'enemy', 'regional', 'trends', 'persona', 'relation', 'craft', 'protocol'] },
    xianxia: { label: '仙侠', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'enemy', 'regional', 'blackbox', 'persona', 'relation', 'craft', 'protocol'] }
  };
  /**
   * 扩展题材名（v2.231.0 / OPT-8）。它**不是第二份题材表** —— 表体只有 THEMES 一份，
   *   本表只回答「哪几张是这一轮加的」（供面板标注与诊断读数）。
   */
  const THEME_EXT = { modern: true, history: true, scifi: true, xianxia: true };
  /**
   * 题材 -> **要开起来的引擎**（v2.258.0 / OPV6-3）。
   *
   * ── 它治什么（现场实测，v2.257.0 探针 tools/v6probes/p_engines.js）────────
   *   100 个「带 enabled + buildBlock + 有写入口」的真机制里，**出厂只开 5 个**。
   *   而 `apply(['urban'])` 此前只改 `rules.ORDER`（题材模块的**注入顺序**），
   *   一次都不碰任何引擎的 `enabled`。于是「我选了都市」与「都市机制在跑」
   *   是**两件互不相干的事**：选完都市，都市的经济/仇敌/律法机制照样一个个关着。
   *   本仓的判据一贯是「装了不等于跑着」（v2.157.0 起）—— 玩家点了题材却什么都没开，
   *   正是这条判据的反面：**说了要跑，就得真跑**。
   *
   * ── 三条口径 ──────────────────────────────────────────────────────────
   *   ① **表只列引擎、不列理由**：每个引擎归哪个题材，按它**造的东西**归（经济造钱、
   *      仇敌造敌意、hazard 造横祸……），不按文件在哪个目录归。一个引擎可以属多个题材
   *      （并集语义，与 `modules` 一致：都市 + 悬疑 ⇒ 两边引擎都要跑）。
   *   ② **本表不写死「什么算引擎」**：成员是否真开关、有没有注入面，一律由
   *      `capabilityTier.shapeOf()` 现场回答（OPV6-1 的同一判据）。表里写了个
   *      不存在的键 ⇒ apply 会把它报进 `notInjected`，而不是假装开了。
   *   ③ **只做「加开」与「收回自己开的」**：见 `apply()` 与 `DEF.engines` 的注释。
   *      题材**绝不**因为「这个引擎不属于我」就去关它 —— 那是档位与玩家自己的事。
   *
   * ── 刻意留空的题材 ────────────────────────────────────────────────────
   *   校园 / 历史 / 现代 / 历史 的引擎面与都市高度重叠（同一个世界，只是视角不同），
   *   故只挂**题材特有**的那几个；其余靠叠加（都市 + 校园）表达。宁可少开，
   *   也不把「选了个题材」膨胀成「把整个档位打开」—— 那是 OPV6-1 的活，不是本题材的。
   */
  const THEME_ENGINES = {
    // 都市：钱、活路、人挤人、消息、仇怨、律法与灰色地带
    urban: ['economy', 'activity', 'family', 'org', 'intel', 'rumor', 'shadow', 'rivalry',
      'marginal', 'tolerance', 'quota', 'gauge', 'survival', 'agency', 'operations',
      'commission', 'freight', 'worldBridge', 'beatFacade', 'motif'],
    // 校园：同龄群体、传言、情绪起伏、暗恋与竞争、成长
    campus: ['affect', 'bonds', 'fondness', 'temperament', 'moodGlide', 'activity', 'family',
      'rivalry', 'rumor', 'spotlight', 'motif', 'appearance', 'ladder'],
    // 悬疑：线索、疑点、藏起来的东西、时间锁、黑箱
    mystery: ['investigation', 'sediment', 'enigma', 'threads', 'foreshadow', 'shadow',
      'temporalLock', 'masks', 'hazard', 'canon', 'storyChoice', 'tempo'],
    // 奇幻：灵气、异兽、因果报应、天数、门阶
    fantasy: ['lingqi', 'beastBond', 'karma', 'survival', 'hazard', 'powerAnchor', 'ladder',
      'eraCycle', 'canon', 'motif', 'gauge'],
    // 经营：钱与账、雇工与订单、物流与谈判、声誉
    business: ['economy', 'commission', 'freight', 'org', 'operations', 'quota', 'gauge',
      'agency', 'diplomacy', 'beatLedger', 'beatReport'],
    // 现代：跟都市同源，加速度与消息面
    modern: ['economy', 'activity', 'org', 'intel', 'rumor', 'operations', 'worldBridge', 'motif'],
    // 历史：气数、纪元、律法、家族、科举式的阶梯
    history: ['eraCycle', 'canon', 'family', 'org', 'karma', 'ladder', 'diplomacy',
      'survival', 'warrant', 'temporalLock'],
    // 科幻：技术、研究、制度惯性、黑箱、信息面
    scifi: ['research', 'org', 'worldBridge', 'enigma', 'canon', 'quota', 'gauge',
      'offlineTick', 'farfield', 'retrieval'],
    // 仙侠：灵气、报应、天数、异兽、门阶、寿数
    xianxia: ['lingqi', 'karma', 'beastBond', 'eraCycle', 'ladder', 'survival', 'hazard',
      'canon', 'powerAnchor', 'motif']
  };
  const stat = { applies: 0, previews: 0, rejects: 0, contrasts: 0, lastTheme: '', lastReason: '',
    // v2.258.0（OPV6-3）：引擎面计数。noops 与 capabilityTier 同义（真的没活可干）；
    //   partials 记「有引擎没真起来」的次数 —— 它是玩家最该看见的那一个数。
    noops: 0, engineOns: 0, engineOffs: 0, partials: 0, lastPartial: 0 };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  function list() {
    return Object.keys(THEMES).map(function (k) {
      return { key: k, label: THEMES[k].label, modules: THEMES[k].modules.slice() };
    });
  }
  function known(name) { return !!THEMES[String(name || '')]; }
  /**
   * 下面三个是本文件对 OPV6-1 判据面的**转发**（不是第二套实现）。
   *   为什么要转发而不是直接 `WA.capabilityTier.flipSwitch(...)`：装载顺序上 theme.js
   *   （LOAD idx 早）可能先于 capability-tier.js 被求值，且题材面在档位面缺席时
   *   **必须照样能用**（题材功能不依赖档位功能的存在）。故这里做三态处理：
   *     · capabilityTier 在 ⇒ 用它（同一判据、同一回读复核）；
   *     · 不在 ⇒ 自带一份**最小等价实现**（带 enabled + 有写入口 + 回读确认，逐条同规），
   *       并在 `engineFace()` 里如实报 `{ via: 'fallback' }` —— 让诊断面看得见「这是降级跑」，
   *       而不是让两条路悄悄分叉（v2.101.0 那类账：缺席与在场长得一样）。
   */
  function cap() { return (WA.capabilityTier && typeof WA.capabilityTier === 'object') ? WA.capabilityTier : null; }
  function shape(key) {
    const c = cap();
    // v2.258.0 收口：判据面**显式点名** `WA.capabilityTier.shapeOf`（先判 `c` 在场再点名调用，
    //   两者是同一个对象）。为什么不让它写成 `c.shapeOf(...)`：清册的引用面口径是
    //   `WA <sep> ns <sep> mem`（tests/inventory.js 的 REF_RE），经由局部变量的调用
    //   **产品侧 refs 读成 0** ⇒ dead-export 台账当场把这两口记成「过度导出（self-only）」。
    //   也就是说，代码是对的、账是错的 —— 治法不是给台账加豁免，而是让引用面如实可见。
    if (c && typeof c.shapeOf === 'function') { try { return WA.capabilityTier.shapeOf(key); } catch (e) { return null; } }
    // 降级：与 capabilityTier.shapeOf 逐条同规（带 enabled + 有 getSettings）
    const m = WA[key];
    if (!m || typeof m !== 'object' || typeof m.getSettings !== 'function') return null;
    let s = null;
    try { s = m.getSettings(); } catch (e) { return null; }
    if (!s || !Object.prototype.hasOwnProperty.call(s, 'enabled')) return null;
    return { key: key, on: s.enabled === true,
      hasBuild: typeof m.buildBlock === 'function', hasSet: typeof m.setSettings === 'function' };
  }
  function flip(key, on) {
    const c = cap();
    // 同上：显式点名 `WA.capabilityTier.flipSwitch`，让「题材面真读档位面判据」这件事在清册里可测
    if (c && typeof c.flipSwitch === 'function') { try { return WA.capabilityTier.flipSwitch(key, on); } catch (e) { return 'not-effective'; } }
    // 降级：toggle + 回读复核（与 capabilityTier.turnOn/turnOff 同规）
    const sh = shape(key);
    if (!sh || !sh.hasSet) return 'missing';
    if (sh.on === (on === true)) return 'already';
    try { WA[key].setSettings({ enabled: on === true }); } catch (e) { return 'not-effective'; }
    const back = shape(key);
    if (!back || back.on !== (on === true)) return 'not-effective';
    return on === true ? 'on' : 'off';
  }
  function uniqArr(arr) {
    const s = {};
    const out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (k) {
      const x = String(k || '');
      if (!x || s[x]) return;
      s[x] = true;
      out.push(x);
    });
    return out;
  }
  /** 题材列表 -> 模块集合（并按 ORDER 原序返回；核心模块永远在场） */
  function compose(names) {
    const order = (WA.rules && Array.isArray(WA.rules.ORDER)) ? WA.rules.ORDER : [];
    const picked = {};
    CORE.forEach(function (k) { picked[k] = true; });
    (Array.isArray(names) ? names : []).forEach(function (n) {
      const t = THEMES[String(n || '')];
      if (!t) return;
      t.modules.forEach(function (k) { picked[k] = true; });
    });
    const mods = order.filter(function (k) { return picked[k] === true; });
    return { modules: mods, dropped: order.filter(function (k) { return picked[k] !== true; }) };
  }
  /**
   * 预览：题材组合对注入面的影响。**纯计算，不落设置**（预览不覆盖）。
   */
  function preview(names) {
    stat.previews++;
    const cur = settings().themes || [];
    // v2.87.0 自纠：未启用题材时「当前面」是**全量 ORDER**，不是 compose([])（那只有 CORE 4 个）。
    //   实测：用 compose([]) 当基线，campus 的 deltaChars 报 +5408（假的增量，
    //   实际是「从 16 模块减到 12」）。差异预览撒谎比没有预览更糟。
    const order = (WA.rules && Array.isArray(WA.rules.ORDER)) ? WA.rules.ORDER : [];
    const a = cur.length ? compose(cur) : { modules: order.slice(), dropped: [] };
    const b = compose(names);
    const chars = function (mods) {
      if (!WA.rules || typeof WA.rules.getModule !== 'function') return 0;
      return mods.reduce(function (n, k) { return n + (WA.rules.getModule(k) || '').length; }, 0);
    };
    const added = b.modules.filter(function (k) { return a.modules.indexOf(k) < 0; });
    const removed = a.modules.filter(function (k) { return b.modules.indexOf(k) < 0; });
    // v2.258.0（OPV6-3）：预览也必须答「会开几个引擎」，否则玩家点了预览只知道模块变了，
    //   apply 之后才第一次看见引擎被开 —— 预览不覆盖的纪律（本文件口径②）要求先把账算清。
    //   纯计算：只读 shape()，不调 flip、不写盘。
    const face = engineFace(names);
    const willOn = face.want.filter(function (k) {
      const sh = shape(k);
      return !!(sh && sh.hasSet && sh.hasBuild && sh.on !== true);
    });
    return { ok: true, current: cur.slice(), next: (Array.isArray(names) ? names.slice() : []),
      modules: b.modules.slice(), moduleCount: b.modules.length,
      chars: chars(b.modules), currentChars: chars(a.modules), deltaChars: chars(b.modules) - chars(a.modules),
      added: added, removed: removed, droppedModules: b.dropped.slice(),
      // 引擎面预览（与 apply 的返回契约同名：enginesOn / notInjected）
      enginesOn: willOn, enginesWant: face.want.slice(), notInjected: face.notInjected.slice(),
      engineCount: face.want.length, engineWillOn: willOn.length,
      previewOnly: true };
  }
  /**
   * 应用（唯一写入口）：未知题材一律拒收，不静默当空集。
   *
   * v2.258.0（OPV6-3）：**本函数现在真开引擎**，不再只改 `rules.ORDER`。
   *   现场病：`apply(['urban'])` 只改注入顺序，经济 / 仇敌 / 律法 一个个关着 ——
   *   「选了都市」与「都市机制在跑」是两件不相干的事。
   *
   * 五条口径（每条都有专锁咬）：
   *   ① **只加开，不关别人的**：收回面严格等于 `settings().engines`（本模块自己开的），
   *      玩家手动开的、档位（capabilityTier.granted）开的，一次都不碰。
   *   ② **逐个真写 + 当场回读复核**：走 `capabilityTier.flipSwitch`，与档位面**同一判据**
   *      （自己再写一遍 setSettings 就是第二套判据，分叉后玩家只看得见报成功那条）。
   *   ③ **部分成功就是部分成功**：没真开起来的进 `notEffective`，没有注入面 / 不是真开关的
   *      进 `notInjected`，两者都非空 ⇒ `partial:true` + `tier-partial` 归因。绝不报「已开启」。
   *   ④ **幂等**：目标引擎全已开、且没有要收回的 ⇒ `noop:true`，不写盘、不计数。
   *   ⑤ **题材与引擎可分开查**：`enginesOn` / `enginesOff` / `enginesGranted` 三个读数
   *      让面板能说「题材 A 开了 12 个机制，其中 2 个没能起来」而不是只报「已应用」。
   */
  function apply(names) {
    const arr = Array.isArray(names) ? names.slice() : [];
    const bad = arr.filter(function (n) { return !known(n); });
    if (bad.length) {
      stat.rejects++; stat.lastReason = 'unknown-theme';
      return { ok: false, reason: 'unknown-theme', unknown: bad, known: Object.keys(THEMES) };
    }
    // 目标引擎集（并集语义，按 THEME_ENGINES 原序去重）
    const wantKeys = [];
    const seen = {};
    arr.forEach(function (n) {
      (THEME_ENGINES[String(n)] || []).forEach(function (k) {
        if (!k || seen[k]) return;
        seen[k] = true;
        wantKeys.push(k);
      });
    });
    const before = Array.isArray(settings().engines) ? settings().engines.slice() : [];
    const wantSet = {};
    wantKeys.forEach(function (k) { wantSet[k] = true; });
    // 要收回的：本模块**此前开过**、新题材不要的（口径①）
    const toOff = before.filter(function (k) { return !wantSet[k]; });

    const notEffective = [];
    const notInjected = [];
    const didOn = [];
    const didOff = [];
    // 收回（只动自己开的）。`already` 与 `off` **分开记**：
    //   `off` 是本模块真关掉的；`already` 是「本该收回、但它已经不在开着」（玩家自己先关了）。
    //   两者都算「本模块不再记这个名字」（granted 里要摘掉），但只有 `off` 进 turnedOff
    //   —— 把 `already` 也算成「我关的」就是虚报工作量（本仓纪律：读数不许比事实大）。
    toOff.forEach(function (k) {
      const x = flip(k, false);
      if (x === 'off') didOff.push(k);
      else if (x === 'not-effective') notEffective.push(k);
      // 'already' / 'missing' 都不进 didOff：一个本就没开，一个键都不在
    });
    // 开出
    wantKeys.forEach(function (k) {
      const sh = shape(k);
      if (!sh || !sh.hasSet) { notInjected.push(k); return; }   // 不是真开关：如实归类，不假装
      if (!sh.hasBuild) { notInjected.push(k); return; }        // 没有注入面：开了也不出声
      const x = flip(k, true);
      if (x === 'on') didOn.push(k);                            // 只有 'on' 才算「本模块开的」
      else if (x === 'already') { /* 玩家/档位/出厂已经开着：不属于我，不得回收 */ }
      else notEffective.push(k);
    });
    // granted = 旧 granted 里**仍在新目标中且此刻真开着**的 + 本次真正由本模块打开的
    //   （与 capabilityTier 的 keptGrant 同规：回滚栈里不留「其实已经关着」的名字）
    const kept = before.filter(function (k) {
      if (!wantSet[k]) return false;
      const sh = shape(k);
      return !!(sh && sh.on === true);
    });
    const granted = uniqArr(kept.concat(didOn));
    const themesChanged = JSON.stringify(arr) !== JSON.stringify(settings().themes || []);
    // granted 是**集合**语义：比较前两侧都排序，否则「同集合不同序」会被误判成有变更，
    //   于是重复 apply 同题材会写盘、幂等当场破功（本仓 v2.257.0 的 B3b 就是为这条立的锁）。
    const grantChanged = JSON.stringify(granted.slice().sort()) !== JSON.stringify(before.slice().sort());
    // 幂等（口径④）：真开关一个没动、题材名与「本模块开过的」名单都没变 ⇒ 不写盘、不入计数
    if (!didOn.length && !didOff.length && !themesChanged && !grantChanged) {
      stat.noops++;
      stat.lastReason = 'noop';
      return { ok: true, themes: arr.slice(), modules: compose(arr).modules, noop: true,
        enginesOn: [], enginesOff: [], enginesGranted: before.slice(),
        notEffective: [], notInjected: notInjected.slice(),
        partial: notInjected.length > 0, partialReason: notInjected.length ? 'tier-partial' : '',
        total: wantKeys.length, saved: null };
    }
    let r = null;
    try {
      r = saveSettings({ themes: arr, engines: granted });
    } catch (e) {
      stat.lastReason = 'save-threw';
      return { ok: false, reason: 'save-threw', themes: arr.slice() };
    }
    stat.applies++; stat.lastTheme = arr.join('+');
    stat.engineOns += didOn.length;
    stat.engineOffs += didOff.length;
    // `tier-partial`：计划要求的归因口径 —— 有引擎没真起来（或表里点了不存在的键）时必须自报，
    //   不许折成「已开启」。`notInjected` 是**静态**的（表的质量），故它也参与 partial，
    //   但不参与幂等判定（否则每次 apply 都会被一个永远修不好的名字顶成「有活干」）。
    const partial = notEffective.length > 0 || notInjected.length > 0;
    if (partial) { stat.partials++; stat.lastPartial = notEffective.length + notInjected.length; }
    stat.lastReason = partial ? 'tier-partial' : 'applied';
    return { ok: true, themes: arr.slice(), modules: compose(arr).modules,
      enginesOn: didOn, enginesOff: didOff, enginesGranted: granted,
      notEffective: notEffective, notInjected: notInjected,
      partial: partial, partialReason: partial ? 'tier-partial' : '',
      total: wantKeys.length, saved: r };
  }
  /** 当前生效的模块（rules 侧注入按它过滤；未启用题材时 = 全量，保持旧行为不变） */
  function activeModules() {
    const t = settings().themes || [];
    if (!t.length) return null;   // null = 未启用题材 => 全量（绝不悄悄改变既有注入）
    return compose(t).modules;
  }
  /**
   * X7（v2.128.0）：**题材差异对照**（B7 收口）。
   *   B7 只做到「模块进没进注入面」，答不出「换了题材，注入面到底哪里不一样」——
   *   用户勾掉一个题材后，能看到的只有总字数变了，看不到**结构性**的差异（多了哪个模块、
   *   少了哪个模块）。两个不同题材装出来要是逐字一样，那题材就是摆设，而这种「摆设」
   *   在没有对照实验时**是看不出来的**（R105 那类「不可判定」的又一例）。
   *
   *   本函数对**同一世界快照**（`WA.rules` 的模块正文此刻是什么就是什么）在两种题材下
   *   的注入面做**结构 diff**：模块集合的增删、字数差、共有的部分。
   *
   *   三条口径：
   *     ① **纯计算**（与 `preview` 同规）：不落设置、不改题材、不碰存档。
   *     ② **两侧都可为空**：`contrast([], ['urban'])` 是合法问题——
   *        空题材侧取**全量 ORDER**（与 `preview` 的基线口径逐字一致，见 v2.87.0 自纠），
   *        不是 `compose([])` 那四个核模块。用错了基线的差异预览会撒谎。
   *     ③ **不做内容质量评判**：只对结构（模块名与字数）做 diff，不比较正文措辞。
   *        「哪个题材写得更好」不是本函数能答的问题，硬答就是越界。
   *
   *   源级投影（「题材 A 注入了 X 源而 B 没有」）**不在本函数**：源表住在 render/inject.js，
   *   本文件不该反向依赖它。回的是模块级的结构 diff，由 `render.themeContrast()` 接过去做投影。
   */
  function contrast(a, b) {
    stat.contrasts++;
    const A = Array.isArray(a) ? a.slice() : [];
    const B = Array.isArray(b) ? b.slice() : [];
    const bad = A.concat(B).filter(function (n) { return !known(n); });
    if (bad.length) {
      stat.lastReason = 'unknown-theme';
      return { ok: false, reason: 'unknown-theme', unknown: bad, known: Object.keys(THEMES) };
    }
    const order = (WA.rules && Array.isArray(WA.rules.ORDER)) ? WA.rules.ORDER : [];
    // 空题材侧 = 全量（与 preview 的基线口径同规：未启用题材时注入面就是整张 ORDER）。
    const setOf = function (names) { return names.length ? compose(names).modules : order.slice(); };
    const sa = setOf(A), sb = setOf(B);
    const chars = function (mods) {
      if (!WA.rules || typeof WA.rules.getModule !== 'function') return 0;
      return mods.reduce(function (n, k) { return n + (WA.rules.getModule(k) || '').length; }, 0);
    };
    // added = 只在 B 出现的模块；removed = 只在 A 出现的模块。命名以 A→B 的迁移方向为准。
    const added = sb.filter(function (k) { return sa.indexOf(k) < 0; });
    const removed = sa.filter(function (k) { return sb.indexOf(k) < 0; });
    const identical = added.length === 0 && removed.length === 0;
    stat.lastReason = identical ? 'identical' : 'diff';
    return { ok: true, identical: identical,
      a: { themes: A, modules: sa.slice(), count: sa.length, chars: chars(sa), all: A.length === 0 },
      b: { themes: B, modules: sb.slice(), count: sb.length, chars: chars(sb), all: B.length === 0 },
      added: added.slice(), removed: removed.slice(),
      common: sa.filter(function (k) { return sb.indexOf(k) >= 0; }).slice(),
      deltaChars: chars(sb) - chars(sa),
      // 反判据的读数形态：两侧一致时把原因写明白，让「红」有据可查，而不是只有一句「一样」。
      note: identical
        ? '两题材的模块集合完全一致 —— 题材对注入面无结构影响（若两者本应不同，这就是缺陷）。'
        : '只做注入面**结构** diff（模块增删与字数），不评判生成内容质量。',
      contrastOnly: true };
  }
  function statView() {
    const t = settings().themes || [];
    return { themes: t.slice(), active: activeModules(), applies: stat.applies,
      previews: stat.previews, rejects: stat.rejects, contrasts: stat.contrasts,
      lastTheme: stat.lastTheme, lastReason: stat.lastReason,
      available: Object.keys(THEMES),
      // v2.258.0（OPV6-3）：引擎面随题材变化的读数（诊断节与面板共用）
      engines: settings().engines || [],
      engineOns: stat.engineOns || 0, engineOffs: stat.engineOffs || 0,
      partials: stat.partials || 0, noops: stat.noops || 0,
      via: cap() ? 'capabilityTier' : 'fallback' };
  }
  /**
   * 题材面**当前让哪些引擎在跑**（v2.258.0 / OPV6-3 的只读口）。
   *   三类分开报，因为这个区分就是「会不会误伤玩家」的判据：
   *     · `granted` —— 本模块开的（切走题材时会被收回的，就是这些）
   *     · `themeRunning` —— 目标集里此刻真在跑的（含 granted + 本来自己就开着的）
   *     · `notInjected` —— 表里写了、但不是「带 enabled + 有 buildBlock」的真机制
   *   `via` 如实报判据来源：'capabilityTier' 或 'fallback'（见上方三态注释）。
   */
  function engineFace(names) {
    const arr = Array.isArray(names) ? names.slice() : (settings().themes || []);
    const want = [];
    const seen = {};
    arr.forEach(function (n) {
      (THEME_ENGINES[String(n)] || []).forEach(function (k) {
        if (!k || seen[k]) return;
        seen[k] = true;
        want.push(k);
      });
    });
    const running = [];
    const notInjected = [];
    want.forEach(function (k) {
      const sh = shape(k);
      if (!sh || !sh.hasSet || !sh.hasBuild) { notInjected.push(k); return; }
      if (sh.on) running.push(k);
    });
    return { themes: arr, want: want.slice(), running: running, notInjected: notInjected,
      granted: (settings().engines || []).slice(),
      /* 空缺：want 里没跑起来的（含没生效与无注入面），面板据此说「还差 N 个」 */
      gap: want.length - running.length,
      via: cap() ? 'capabilityTier' : 'fallback' };
  }
  /**
   * B7 第三项：三插件职责分离（事实结算 / 证据读取 / 交互执行）。
   *   缺席**降级可见**：读 compat.detect()/lonshaReader 的现场探测结果，
   *   而不是写死「已接入」。谁的活谁干——本扩展只做事实结算面。
   */
  function separation() {
    const d = (WA.compat && typeof WA.compat.detect === 'function') ? (function () { try { return WA.compat.detect(); } catch (e) { return null; } })() : null;
    const lr = WA.lonshaReader;
    // ★ v2.101.0（O11）修正：此处原读 `s.state`，而 lonshaSource() 从不返回该字段
    //   （它回的是 mounted / sourceState / lastError / hasSnapshot / reason）⇒
    //   无论上游在不在、版本对不对，读数一律 `unknown`。改为读**真源字段**，
    //   并把「不在」与「探不出」分开：不在报 not-mounted，探针抛错报 thrown。
    const lonState = (function () {
      if (!lr || typeof lr.lonshaSource !== 'function') return 'consumer-missing';
      try {
        const s = lr.lonshaSource(lr.LONSHA_BRIDGE_ID);
        if (!s || s.mounted !== true) return (s && s.reason) || 'not-mounted';
        return s.reason || 'unknown';
      } catch (e) { return 'thrown'; }
    })();
    // ★ v2.101.0（O11）修正：`present` 原为**写死 false**（RubyPhone 那一行永远说「未接入」）。
    //   改为看**入站桥现场**：桥在且相位不是 disabled ⇒ 这条边是通的。
    //   缺席与「已关闭」分开：disabled 由用户在面板关的，不是对方不在。
    const phone = (function () {
      const pb = WA.phoneBridge;
      if (!pb || typeof pb.phaseOf !== 'function') return { present: false, state: 'absent', note: '入站桥未加载；缺席不降级事实结算面' };
      try {
        const ph = pb.phaseOf();
        const phase = String((ph && ph.phase) || 'unknown');
        if (phase === 'disabled') return { present: false, state: 'disabled', note: '入站桥已关闭（用户关闭 ≠ 对方不在）：手机侧操作不会进世界台账' };
        return { present: true, state: phase, note: (ph && ph.note) || '' };
      } catch (e) { return { present: false, state: 'thrown', note: '入站桥探针抛错' }; }
    })();
    return {
      roles: [
        { owner: 'WorldAxis', duty: '事实结算', owns: ['causal', 'world', 'evolution', 'intel'], present: true },
        { owner: 'LonSha', duty: '证据读取', owns: ['lonshaReader'], present: !!d && d.tavernHelper === true, state: lonState },
        { owner: 'RubyPhone', duty: '交互执行', owns: ['phoneBridge'], present: phone.present, state: phone.state, note: phone.note }
      ],
      // X8（v2.128.0）：**契约握手**。上面 roles 答「谁在不在」，本字段答「契约对不对得上」——
      //   「装了但契约版本不是这一版」此前与「没装」在读数上长得一样（同一个 `absent`），
      //   处置却相反。握手是**惰性只读**（只在调用 separation 时读一次现场），
      //   且**不驱动对端**（不调它的 refresh），缺席如实降级、绝不写死「已接入」。
      handshake: (function () {
        try {
          if (!WA.bridge || typeof WA.bridge.handshake !== 'function') return null;
          const h = WA.bridge.handshake();
          return h ? { matched: h.matched, matchedCount: h.matchedCount, degraded: (h.degraded || []).slice(),
            edges: (h.edges || []).map(function (x) { return { key: x.key, id: x.id, present: x.present, version: x.version, expect: x.expect, matched: x.matched, why: x.why }; }),
            note: h.note } : null;
        } catch (e) { return { error: 'handshake-threw' }; }
      })(),
      host: d ? { sillyTavern: d.sillyTavern, tavernHelper: d.tavernHelper, variables: d.variables, worldbook: d.worldbook } : null,
      // 去重/隔离/来源版本的现状：如实报告，不宣称「已实现」
      dedupe: 'chatcache 按 chatId 隔离快照',
      chatIsolation: 'store 按 chatId 分键',
      sourceVersion: 'lonshaReader 契约版本只拦显式不匹配（缺失视为旧版放行）',
      absentPolicy: '缺席降级可见：engine-absent / engine-empty / thrown 三态分开'
    };
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v2.87.0：known()/compose() 是本文件内部自用口（preview/apply/activeModules 消费，
  //   外部零引用 = 过度导出），故不进导出面。题材能力对外由 list/preview/contrast/apply/
  //   activeModules/statView/separation 七个有真消费方的口表达。
  WA.theme = { THEMES, CORE, THEME_EXT: THEME_EXT, THEME_ENGINES: THEME_ENGINES,
    list: list, preview: preview, contrast: contrast,
    apply: apply, activeModules: activeModules, statView: statView,
    engineFace: engineFace, separation: separation };
  if (WA.log) WA.log('info', '题材规则组合已加载');
})();
