/**
 * WorldAxis engines/recipe.js (v2.117.0) — 题材完整配置配方（计划二 B6 后半）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────
 *   engines/theme.js 只把题材做成「**模块清单的显式组合**」：装/卸题材只改顺序表。
 *   那解决「别让奇幻模块进都市局」，但答不出一个局的其余部分——
 *   这一局允许哪些行动与资源词汇、运行政策是什么、信息边界在哪、场景从哪起手。
 *   于是现场两种做法都为害：要么每局手工重配一遍（配歪了没人发现），
 *   要么把人物姓名 / 世界设定 / 固定剧情**写进角色卡**（于是所有卡都长一个样，而
 *   本规划的硬约束正是「不将人物姓名、世界设定或固定剧情注入所有角色卡」）。
 *
 * ── 本模块把题材升级为**配方**，六个槽位全部显式 ────────────────
 *   ① `requires`   必要能力：主题模块（复用 theme 的组合能力）+ 运行时引擎 + 可选引擎。
 *   ② `policies`   运行政策：**封闭集合**（POLICIES 表），每条政策有 id / cn / 内容 /
 *                  以及它**与谁冲突**。政策不是自由文本——自由文本没法冲突预览。
 *   ③ `kinds`      允许的行动词汇：必须是 `WA.act.KINDS` 的子集，且由启动期扫描核对
 *                  （对不上 ⇒ 进 `catalogView().kindsStale`，不静默接受）。
 *   ④ `resources`  允许的资源词汇：本模块**不收自由文本表**，而是把来源指向
 *                  `org` 已登记的资源名（运行期 `stockOf` 的键）。词汇真源在组织引擎那边，
 *                  这里只声明「这一局以什么为经济轴」，并在运行时用真源核对。
 *   ⑤ `scenes`     场景种子：**可选内容包**，逐条 id + 起手情形。**不含人名与世界设定**
 *                  （本模块的静态门禁就是查这个），使用要显式 `seed()` 取一条。
 *   ⑥ `boundaries` 信息边界：这一局**哪些事本不该被模型知道**（如悬疑的凶手、经营的账面
 *                  缺口来源）。它是给运维与作者看的声明面，不是注入面。
 *   另加 `acceptance` 验收样本：状态层（可自动判定）+ 生成层（相同起点、不同题材对比）。
 *
 * ── 七条设计边界（全是否定式）──────────────────────────────────
 *   ① **不覆盖基础事实**：`basics()` 给出世界事实 / 时间来源 / 身份约束三条，
 *      每条带真源的**两种证据锚点**并逐条核对：存在性面（该出口现在还在不在）与
 *      源码面（该字面量还在不在真源文件里）。源码面要读文件，而本模块运行在宿主页面里、
 *      读不到自身源码 ⇒ 源码面只由**调用方显式传入的读盘能力**（`opts.readSrc`）来核 ——
 *      产品面一个全局名都不读（本仓有判据把「宿主提供、以 A.ns 形态被读的外名」冻结为空）。
 *      三个态**各有各的词**：
 *      `verified`（注入且锚点都在）/ `unverified`（注入面不在——未核 ≠ 通过）/ `no-symbol`
 *      （锚点当场查不到）。只有 `no-symbol` 进 `basicsStale`（那是确凿的错），
 *      `unverified` 由 `basicsUnverified` 单独带出——把「没核对过」混进「核对落空」，
 *      面板就会对每一份正常装载的仓库报三条假落空，真正的落空反而淹在里面。
 *      配方**不含**这三条的覆盖面——覆盖它们是「拿题材改事实」，本模块没有这条路径。
 *   ② **未知配方不静默**：`apply` 对不认识的配方返回 `unknown-recipe`，**不回落成默认配方**
 *      （回落会让「启用了」与「没启用」长得一样，与 theme.enable 的 unknown-theme 同口径）。
 *   ③ **冲突预览只报不改**：`preview` 报出题材叠加冲突与政策并存冲突，**不阻止**，
 *      也不替人消解；它给的是「这么配会发生什么」，决定权在调用方。
 *   ④ **动作词汇对不上就是缺陷**：`kinds` 不在 `WA.act.KINDS` 里 ⇒ 记 `kindsStale`，
 *      不去猜一个相近名（猜错会让「这一局允许做的事」与真跑允许的事不一致）。
 *   ⑤ **不注入内容**：本模块**不做任何注入**（无 buildBlock）。场景是**取用制**：
 *      谁要用谁调 `seed()`，不调就一个字节都不进上下文。
 *   ⑥ **不落新容器**：配方是**配置**（settings 里一个配方名），不是世界状态；
 *      运行期状态（这局用了哪个配方）只在设置与 statView 里，不进骨架。
 *   ⑦ **政策是封闭集合**：表外政策名一律拒收（`unknown-policy`），
 *      不把「没听过的政策」当成一句注释收下——那样冲突预览就永远照不到它。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_recipe_settings_v1';
  const DEF = { name: '' };
  const __REG = { key: LS_KEY, def: DEF, module: 'recipe' };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /**
   * 运行政策表（**封闭集合**）。`vs` 是「与哪些政策并存会互相拧」——
   *   冲突预览的全部数据来源就是它。加一条政策必须同时想清楚它与谁冲突，
   *   否则它就只是「一句没人核对的注释」，正是本规划点名的失效形态。
   */
  const POLICIES = [
    { id: 'intel-source', cn: '情报必带来源', text: '每条情报都要能在世界侧追到来源（谁说的/在哪见的）；无来源的说法不进认知面。', vs: ['improv'] },
    { id: 'improv', cn: '允许即兴', text: '未登记的场景要素可由模型即兴生成，事后再登记。', vs: ['intel-source'] },
    { id: 'cost-bearing', cn: '代价必落地', text: '任何收益必须连带一项已登记成本或义务，不接受「白拿」。', vs: [] },
    { id: 'fact-priority', cn: '事实优先', text: '正文与已结算事实冲突时，以事实为准并显式改写正文。', vs: ['rumor-driven'] },
    { id: 'rumor-driven', cn: '传闻驱动', text: '驱动叙事的是传闻与误解，事实只在被核实后才约束正文。', vs: ['fact-priority'] },
    { id: 'deadline', cn: '期限硬约束', text: '登记的期限到点即算逾期，不因叙事需要而延长。', vs: [] },
    { id: 'escalate-slow', cn: '慢升级', text: '忽略的线索只在可见度提高后升级，不因轮次累积自动升级为灾难。', vs: [] },
    { id: 'canon-divergence', cn: '允许偏离原著', text: '允许偏离原著幕目；偏离必须留痕（哪一幕、偏在哪）。', vs: [] }
  ];
  const POLICY_MAP = {};
  POLICIES.forEach(function (p) { POLICY_MAP[p.id] = p; });

  /**
   * 基础事实三条（配方**不得覆盖**）。`evidence` 每条 = { file, text, ns }：
   *   · text：真源文件里的**逐字字面量**（源码面锚点，核不核得到取决于是否注入 __sourceText）；
   *   · ns  ：该条真源所属的运行时命名空间（存在性读数，装载期当场可查）。
   * 为什么是三处真源而不是本模块自己再声明一遍：覆盖基础事实是「拿题材改事实」，
   *   本模块没有这条路径；它只能**指着真源**说「这三样不由题材决定」。
   */
  const BASICS = [
    { id: 'worldFacts', cn: '世界事实', text: '已结算的世界事实优先于任何叙事口径；与事实冲突的正文须改写。',
      evidence: [{ file: 'engines/intel.js', text: 'function truthOf', ns: 'intel' },
        { file: 'engines/causal.js', text: 'worldFacts', ns: 'causal' }] },
    { id: 'time', cn: '时间来源', text: '决策时间取世界钟（clock.now），测量时间取墙钟；两者不混用。',
      evidence: [{ file: 'core/clock.js', text: 'wallNow', ns: 'clock' },
        { file: 'engines/tempo.js', text: 'clockNow', ns: 'tempo' }] },
    { id: 'identity', cn: '身份约束', text: '人物身份以持久 id 与改名台账为真源；不得由题材改写身份或凭空造人。',
      evidence: [{ file: 'engines/intel.js', text: "'p_' + who", ns: 'intel' },
        { file: 'engines/act.js', text: 'missing-person', ns: 'act' }] }
  ];
  /** 题材叠加的已知冲突（规则冲突预览的题材面）。 */
  const THEME_CLASH = [
    { pair: ['mystery', 'fantasy'], id: 'double-blackbox',
      cn: '悬疑 + 奇幻同时启用', why: '两侧都声明 blackbox（信息不可靠）：两层不可靠叠加会让「多套解释都成立」退化成「没有可核实的解释」。' },
    { pair: ['mystery', 'business'], id: 'clue-vs-ledger',
      cn: '悬疑 + 经营同时启用', why: '经营要求账目可对账（事实优先），悬疑要求线索来源可疑；同一条信息在两边的处理口径会互相打脸。' }
  ];

  /**
   * 五张配方。`themes` 复用 theme.js 的既有组合能力（不另立模块清单）；
   * `scenes` 是**可选内容包**：只有 id 与起手情形，**不含人名、世界设定与固定剧情**。
   */
  const RECIPES = {
    urban: {
      cn: '都市 / 校园', core: '日程冲突、兼职、社交信息差、机会窗口',
      themes: ['urban'], extraThemes: ['campus'],
      policies: ['fact-priority', 'cost-bearing', 'escalate-slow'],
      kinds: ['wait', 'rest', 'move', 'meet', 'tell', 'work', 'deliver'],
      resources: ['钱', '时间', '人情'],
      engines: ['opportunity', 'act', 'world', 'org', 'life', 'intel', 'tempo'],
      optional: ['recipe', 'theme', 'chapters', 'spotlight'],
      scenes: [
        { id: 'urban-double-book', title: '两件事撞在同一天', prompt: '同一天里同时被约了两件事，两边都不能改期；当事人还没告诉任何一方自己另有安排。' },
        { id: 'urban-side-job', title: '兼职与共同准备', prompt: '为了一份兼职错过了一场早就说好的共同准备，对方已经等了一会儿。' },
        { id: 'urban-info-gap', title: '消息先到了别人手里', prompt: '同一条消息有人先知道却没有立刻说；后知道的人开始从别人的反应里察觉不对。' }
      ],
      boundaries: ['不该知道对方没说出口的打算（只可从行为与时间表推断）',
        '不该知道兼职雇主的真实意图（除非有来源）',
        '不该把「听说」当成已经核实'],
      acceptance: [
        { layer: 'state', id: 'urban-a1', text: '日程互斥时 world.canBeAt 给出 false 且带归因，不静默放行。' },
        { layer: 'state', id: 'urban-a2', text: '机会窗口涉及者之外的人作答 ⇒ not-entitled。' },
        { layer: 'gen', id: 'urban-a3', text: '相同起点下，缺 `intel-source` 政策的正文里出现无来源断言 ⇒ 记一次。' },
        { layer: 'gen', id: 'urban-a4', text: '相同起点换人物设置后，人物取舍应随其目标与承诺变化（不是只换名字）。' }
      ]
    },
    mystery: {
      cn: '悬疑', core: '证据来源、不同知情时间、矛盾主张',
      themes: ['mystery'], extraThemes: [],
      policies: ['intel-source', 'rumor-driven', 'escalate-slow', 'fact-priority'],
      kinds: ['wait', 'rest', 'move', 'meet', 'tell', 'work', 'deliver'],
      resources: ['时间', '线索', '人情'],
      engines: ['opportunity', 'intel', 'causal', 'world', 'act', 'threads'],
      optional: ['blackbox', 'enemy', 'spotlight', 'chapters'],
      scenes: [
        { id: 'mystery-split-view', title: '同一线索两种说法', prompt: '同一件事两个人说得不一样，而两人都没理由撒谎；先开口的那个人更早到场。' },
        { id: 'mystery-source-doubt', title: '来源成疑', prompt: '关键说法唯一的来源是一个有动机修饰它的人，且他没有旁证。' },
        { id: 'mystery-gap', title: '行踪空档', prompt: '某人在关键时间段里没有任何他人可证的在场记录，而那段时间恰好够走一趟。' }
      ],
      boundaries: ['不该知道未登场人物的真实动机与幕后关系（只可从证据推断）',
        '不该知道「谁在说谎」这个结论本身——只能知道证据冲突',
        '不该看到任何未在正式渠道出现的结论'],
      acceptance: [
        { layer: 'state', id: 'mystery-a1', text: 'intel.verify 之后 entitledTo 由 false 变 true，且 truthOf 不变（核实不改事实）。' },
        { layer: 'state', id: 'mystery-a2', text: '弱证据（转述）不得抬升为 witness/record 档。' },
        { layer: 'gen', id: 'mystery-a3', text: '相同起点下，不同知情时间的人物写出的正文线索指向不同假设。' },
        { layer: 'gen', id: 'mystery-a4', text: '同一起点重复采样，结论不得每轮翻新（重复率与稳定性可测）。' }
      ]
    },
    business: {
      cn: '经营', core: '采购、库存、工资、交付',
      themes: ['business'], extraThemes: ['urban'],
      policies: ['fact-priority', 'cost-bearing', 'deadline'],
      kinds: ['wait', 'rest', 'move', 'meet', 'tell', 'work', 'deliver'],
      resources: ['粮', '布', '钱'],
      engines: ['opportunity', 'org', 'world', 'act', 'ledger', 'economy'],
      optional: ['regional', 'trends', 'quota'],
      scenes: [
        { id: 'biz-blocked-route', title: '货运受阻', prompt: '交付在即，常走的那条路被天气/事故封了；绕路会多花时间，原地等则可能误期。' },
        { id: 'biz-short-count', title: '账面缺一箱', prompt: '入库数与出库数对不上，缺的那一箱在两次交接之间消失了；两次交接都有人签字。' },
        { id: 'biz-payroll-day', title: '发薪日库存不够', prompt: '本期薪水总额超过库里现钱，名册上有几位是刚进来的新人。' }
      ],
      boundaries: ['不该知道供应商的底价与真实成本（只能从报价推断）',
        '不该知道账面缺口的真实去向（除非有证据）',
        '不该凭空知道未来行情'],
      acceptance: [
        { layer: 'state', id: 'biz-a1', text: '库存在任何路径下不为负；付不出即转欠账，不静默减半。' },
        { layer: 'state', id: 'biz-a2', text: '工资支付与库存变动共享同一支笔（transfer），逐笔进流水。' },
        { layer: 'state', id: 'biz-a3', text: '重复触发同一工资周期不再次扣款。' },
        { layer: 'gen', id: 'biz-a4', text: '相同起点下，选恢复路线与改经营方向会走向不同的正文后果。' }
      ]
    },
    survival: {
      cn: '奇幻 / 生存', core: '补给、道路风险、组织义务、未知情报',
      themes: ['fantasy'], extraThemes: [],
      policies: ['cost-bearing', 'deadline', 'intel-source', 'escalate-slow'],
      kinds: ['wait', 'rest', 'move', 'meet', 'tell', 'work', 'deliver'],
      resources: ['粮', '药', '火种'],
      engines: ['opportunity', 'world', 'org', 'survival', 'act', 'weather'],
      optional: ['hazard', 'regional', 'eraCycle'],
      scenes: [
        { id: 'surv-half-supply', title: '补给只够一半路', prompt: '出发前清点发现补给只够走一半路程，而目的地的人还在等。' },
        { id: 'surv-two-roads', title: '两条路都有已知风险', prompt: '近路有过塌方记录，远路要绕过一片无人区；两条路的风险都有人见过，但没人说得清现在的情况。' },
        { id: 'surv-hidden-injury', title: '同行者隐瞒了伤', prompt: '同行者没说自己受了伤，直到行进速度明显掉下来才被注意到。' }
      ],
      boundaries: ['不该知道路上此刻的真实状况（只有历史记录与传闻）',
        '不该知道同伴隐瞒的事（只能从表现推断）',
        '不该知道尚未出现的危险'],
      acceptance: [
        { layer: 'state', id: 'surv-a1', text: '资源不足时空缺照实报（shortfall），不生成不存在的补给。' },
        { layer: 'state', id: 'surv-a2', text: '未登记的道路不可通行（unknown-route），不按直线距离估。' },
        { layer: 'gen', id: 'surv-a3', text: '相同起点下，依已知情报选路线会写出与「按直觉走」不同的正文。' },
        { layer: 'gen', id: 'surv-a4', text: '正文里出现的补给与伤情须能追到已登记事实或明确来源。' }
      ]
    }
  };
  /** 来源参照：主题模块清单的真源在 theme.js（不复制一份，避免两处漂移）。 */
  const SOURCE_FILES = { themes: 'engines/theme.js', kinds: 'engines/act.js', org: 'engines/org.js' };

  const stat = { previews: 0, applies: 0, rejects: 0, seeds: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function list() {
    return Object.keys(RECIPES).map(function (k) {
      return { key: k, cn: RECIPES[k].cn, core: RECIPES[k].core, themes: RECIPES[k].themes.slice(),
        policies: RECIPES[k].policies.slice(), kinds: RECIPES[k].kinds.slice(),
        resources: RECIPES[k].resources.slice(), scenes: RECIPES[k].scenes.length };
    });
  }
  function known(name) { return !!RECIPES[String(name || '')]; }

  /**
   * 装载期核对：动作词汇必须真是 act.KINDS 的子集；主题名必须真在 theme.THEMES 里。
   *   为什么不做成运行期检查：这类不一致是**配置漂移**，跑一局看不出来——
   *   只有静态比对才照得到，而它一旦漂移，「这一局允许做的事」就是假的。
   */
  function staleness() {
    const out = { kinds: [], themes: [], policies: [] };
    const actKinds = (WA.act && Array.isArray(WA.act.KINDS)) ? WA.act.KINDS : null;
    const themes = (WA.theme && WA.theme.THEMES) ? WA.theme.THEMES : null;
    Object.keys(RECIPES).forEach(function (k) {
      const r = RECIPES[k];
      if (actKinds) (r.kinds || []).forEach(function (x) { if (actKinds.indexOf(x) < 0) out.kinds.push(k + ':' + x); });
      if (themes) (r.themes || []).concat(r.extraThemes || []).forEach(function (x) { if (!themes[x]) out.themes.push(k + ':' + x); });
      (r.policies || []).forEach(function (x) { if (!POLICY_MAP[x]) out.policies.push(k + ':' + x); });
    });
    return out;
  }
  /**
   * 基础事实核对（逐条、逐锚点）。三态，且**三个态是三个不同的词**：
   *   · null        —— 源码面被注入且全部锚点都在（只有显式注入时才可能得到它）；
   *   · 'unverified'—— 源码面未注入（产品与默认门禁的常见态）：**未核，不等于通过**；
   *   · 'no-symbol' —— 锚点当场查不到（真源改名 / 文件被删）：确凿的错。
   * `live`（真源命名空间在不在）只作**读数**带出，不参与 stale 判定 —— 漏装一个模块
   *   会让它变 false，那是装载面的账，不该记成配方的缺陷。
   * 为什么不做「命中多次 = 歧义」这一档：文本锚点（如 worldFacts）在同一文件里
   *   本来就会出现多次，按次数判歧义会对正确代码误报 —— 那是把工具缺陷记到被测对象头上。
   */
  function basics(opts) {
    // 读源码的能力由**调用方显式传入**（测试/命令行）。不传 ⇒ 一律未核，如实报。
    const read = (opts && typeof opts.readSrc === 'function') ? opts.readSrc : null;
    return BASICS.map(function (b) {
      const ev = [];
      const missing = [];
      let hard = null, injected = false;
      (b.evidence || []).forEach(function (e) {
        const ns = WA[e.ns];
        const liveOk = !!(ns && e.ns);
        let hits = 0;
        let src = null;
        if (read) { try { src = read(e.file); } catch (x) { src = null; } }
        if (src !== null && src !== undefined) {
          injected = true;
          hits = String(src).indexOf(e.text) >= 0 ? 1 : 0;
        }
        if (hits === 0 && injected) { missing.push(e.file + ':' + e.text); if (!hard) hard = 'no-symbol'; }
        ev.push({ file: e.file, text: e.text, ns: e.ns, live: liveOk, hits: hits });
      });
      // 三态由**一个**字段承载（`state`），两个派生判定都从它读 ——
      //   再挂一个 `stale` 布尔就成两份算法，迟早互相打脸。
      const st = hard ? 'no-symbol' : (injected ? 'verified' : 'unverified');
      return { id: b.id, cn: b.cn, text: b.text, evidence: ev, state: st, missing: missing };
    });
  }
  /** 「确凿的错」——只有这一档算 stale。未核不是 stale，落空才是。 */
  function basicsStale(opts) {
    return basics(opts).filter(function (b) { return b.state === 'no-symbol'; }).map(function (b) { return b.id; });
  }
  /** 「未核（≠通过）」——源码面未注入时的常态，单独带出，谁也不许冒充谁。 */
  function basicsUnverified(opts) {
    return basics(opts).filter(function (b) { return b.state === 'unverified'; }).map(function (b) { return b.id; });
  }
  /** 题材叠加冲突：把配方的题材集合（含 extraThemes）与 theme.js 的题材名一起看。 */
  function themeClashes(themes) {
    const set = {};
    (themes || []).forEach(function (t) { set[t] = true; });
    return THEME_CLASH.filter(function (c) { return set[c.pair[0]] && set[c.pair[1]]; })
      .map(function (c) { return { id: c.id, cn: c.cn, why: c.why, pair: c.pair.slice() }; });
  }
  /** 政策并存冲突：按 POLICIES 的 `vs` 双向找一次，同一对只报一条。 */
  function policyClashes(policies) {
    const set = {};
    (policies || []).forEach(function (p) { set[p] = true; });
    const seen = {}, out = [];
    (policies || []).forEach(function (id) {
      const p = POLICY_MAP[id];
      if (!p) return;
      (p.vs || []).forEach(function (other) {
        if (!set[other]) return;
        const key = [id, other].sort().join('|');
        if (seen[key]) return;
        seen[key] = true;
        const q = POLICY_MAP[other];
        out.push({ id: key, a: id, b: other, cn: (p.cn + ' × ' + (q ? q.cn : other)),
          why: '两者的口径互斥：' + p.text + ' / ' + (q ? q.text : other) });
      });
    });
    return out;
  }
  /** 装配面：一个配方实际会用到的题材 / 政策 / 引擎（含 extraThemes）。 */
  function specOf(name) {
    const r = RECIPES[String(name || '')];
    if (!r) return null;
    return { themes: r.themes.concat(r.extraThemes || []), policies: r.policies.slice(),
      kinds: r.kinds.slice(), resources: r.resources.slice(), engines: r.engines.slice(), optional: r.optional.slice() };
  }
  /**
   * 预览（**纯计算，不落设置**，与 theme.preview 同规）：
   *   装配面 + 规则冲突 + 基础事实现状 + 与当前生效题材的差异（委托 theme.preview）。
   */
  function preview(name) {
    stat.previews++;
    const k = String(name || '');
    if (!known(k)) { stat.rejects++; stat.lastReason = 'unknown-recipe'; return { ok: false, reason: 'unknown-recipe', unknown: k, known: Object.keys(RECIPES) }; }
    const r = RECIPES[k], spec = specOf(k);
    const st = staleness();
    const stale = [];
    spec.kinds.forEach(function (x) { if (st.kinds.indexOf(k + ':' + x) >= 0) stale.push('kind:' + x); });
    spec.themes.forEach(function (x) { if (st.themes.indexOf(k + ':' + x) >= 0) stale.push('theme:' + x); });
    spec.policies.forEach(function (x) { if (st.policies.indexOf(k + ':' + x) >= 0) stale.push('policy:' + x); });
    const themeDiff = (WA.theme && typeof WA.theme.preview === 'function' && WA.theme.THEMES)
      ? (function () { try { const p = WA.theme.preview(spec.themes); return p && p.ok ? { currentChars: p.currentChars, chars: p.chars, deltaChars: p.deltaChars, added: p.added, removed: p.removed } : null; } catch (e) { return null; } })()
      : null;
    const bStale = basicsStale();
    return { ok: true, previewOnly: true, name: k, cn: r.cn, core: r.core,
      requires: { themes: spec.themes.slice(), engines: spec.engines.slice(), optional: spec.optional.slice() },
      policies: spec.policies.map(function (p) { const q = POLICY_MAP[p]; return { id: p, cn: q ? q.cn : p, text: q ? q.text : '' }; }),
      kinds: spec.kinds.slice(), resources: spec.resources.slice(),
      scenes: r.scenes.map(function (s) { return { id: s.id, title: s.title }; }),
      boundaries: (r.boundaries || []).slice(), acceptance: (r.acceptance || []).slice(),
      themeDiff: themeDiff,
      clashes: { themes: themeClashes(spec.themes), policies: policyClashes(spec.policies) },
      basics: basics(), basicsStale: bStale, basicsUnverified: basicsUnverified(),
      stale: stale,
      policyVocab: POLICIES.map(function (p) { return { id: p.id, cn: p.cn }; }),
      // 预览不改任何设置 ⇒ 如实标出「这里没有写盘」
      wrote: null };
  }
  /**
   * 应用（唯一写入口）：未知配方拒收；已知则**把题材组合交给 theme.apply**（既有能力，
   *   不另立写盘路径），配方名落进本模块设置。
   *   注意：这里**不覆盖**基础事实与政策之外的任何世界状态——政策是声明面，
   *   它约束的是运维与作者怎么用，不是引擎里的一条新事实。
   */
  function apply(name) {
    const k = String(name || '');
    if (!k) { const r = saveSettings({ name: '' }); stat.applies++; stat.lastReason = 'cleared'; return { ok: true, name: '', cleared: true, saved: r }; }
    if (!known(k)) { stat.rejects++; stat.lastReason = 'unknown-recipe'; return { ok: false, reason: 'unknown-recipe', unknown: k, known: Object.keys(RECIPES) }; }
    const spec = specOf(k);
    let themeApplied = null;
    if (WA.theme && typeof WA.theme.apply === 'function') {
      try { themeApplied = WA.theme.apply(spec.themes); } catch (e) { themeApplied = { ok: false, reason: 'theme-throw' }; }
      if (!themeApplied || !themeApplied.ok) {
        stat.rejects++; stat.lastReason = 'theme-refused';
        return { ok: false, reason: 'theme-refused', name: k, themeReason: (themeApplied && themeApplied.reason) || 'unavailable' };
      }
    }
    const r = saveSettings({ name: k });
    stat.applies++; stat.lastReason = 'applied';
    return { ok: true, name: k, cn: RECIPES[k].cn, themes: spec.themes.slice(),
      policies: spec.policies.slice(), themeApplied: themeApplied ? { ok: true, themes: themeApplied.themes } : null, saved: r,
      // 冲突**只报不改**：应用成功不等于「这么配没问题」。
      clashes: { themes: themeClashes(spec.themes), policies: policyClashes(spec.policies) },
      basicsStale: basicsStale(), basicsUnverified: basicsUnverified() };
  }
  /**
   * 场景种子（**取用制**）：不调就不进上下文。整数索引按环形取，
   *   无索引时用 rand（缺 rand 退回 0——不假装随机成功）。
   */
  function seed(name, index) {
    const k = String(name || settings().name || '');
    if (!known(k)) { stat.blocked++; stat.lastReason = 'unknown-recipe'; return { ok: false, reason: 'unknown-recipe', unknown: k }; }
    const arr = RECIPES[k].scenes;
    if (!arr.length) { stat.blocked++; stat.lastReason = 'no-scene'; return { ok: false, reason: 'no-scene', name: k }; }
    let i = Number(index);
    if (!isFinite(i)) {
      i = 0;
      try { if (WA.rand && typeof WA.rand.int === 'function') i = WA.rand.int(arr.length); } catch (e) { i = 0; }
    }
    const n = ((Math.floor(i) % arr.length) + arr.length) % arr.length;
    const s = arr[n];
    stat.seeds++; stat.lastReason = 'seeded';
    return { ok: true, name: k, cn: RECIPES[k].cn, index: n, count: arr.length,
      scene: { id: s.id, title: s.title, prompt: s.prompt } };
  }
  function statView() {
    const cfg = settings();
    const st = staleness();
    const themeNow = (WA.theme && typeof WA.theme.statView === 'function') ? (function () { try { const v = WA.theme.statView(); return { themes: (v.themes || []).slice(), available: (v.available || []).length }; } catch (e) { return null; } })() : null;
    const stale = st.kinds.concat(st.themes, st.policies);
    return { name: cfg.name || '', known: Object.keys(RECIPES), policyCount: POLICIES.length,
      theme: themeNow,
      staleness: { kinds: st.kinds.slice(), themes: st.themes.slice(), policies: st.policies.slice(), total: stale.length },
      basicsStale: basicsStale(), basicsUnverified: basicsUnverified(),
      previews: stat.previews, applies: stat.applies, rejects: stat.rejects, seeds: stat.seeds,
      lastReason: stat.lastReason, faults: Object.assign({}, stat.faults) };
  }
  /**
   * 全量目录（只读）：配方清单 + 冲突矩阵 + 政策表 + 基础事实。
   *   它是「规则冲突预览」的**静态面**（不看当前启用什么），供面板与诊断直接展示。
   */
  function catalogView() {
    const st = staleness();
    return { recipes: list(), policies: POLICIES.map(function (p) { return { id: p.id, cn: p.cn, text: p.text, vs: (p.vs || []).slice() }; }),
      themeClash: THEME_CLASH.map(function (c) { return { id: c.id, pair: c.pair.slice(), cn: c.cn, why: c.why }; }),
      basics: basics(), basicsStale: basicsStale(), basicsUnverified: basicsUnverified(),
      kindsStale: st.kinds.slice(), themeStale: st.themes.slice(), policyStale: st.policies.slice(),
      sources: Object.assign({}, SOURCE_FILES) };
  }

  WA.recipe = {
    RECIPES: RECIPES, POLICIES: POLICIES, BASICS: BASICS, THEME_CLASH: THEME_CLASH, SOURCE_FILES: SOURCE_FILES,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    // specOf 只服务本模块的 preview / apply（装配面已内联进两者的返回体），
    //   故不进导出面——「导出了但没人读」与「声明了却永远不成立」同族。
    list: list,
    preview: preview, apply: apply, seed: seed,
    basics: basics, basicsStale: basicsStale, basicsUnverified: basicsUnverified, staleness: staleness,
    themeClashes: themeClashes, policyClashes: policyClashes,
    catalogView: catalogView, statView: statView,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (WA.log) WA.log('info', '题材配方已加载');
})();