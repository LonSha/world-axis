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
    },
    /**
     * ── v2.231.0（优化 OPT-8）：三张**带词汇声明**的配方 ──────────────────────
     *   旧五张只声明「装哪些模块」，执行器里的货币 / 配方 / 判定维度仍是写死的常量。
     *   本块新增两个槽位：`economy`（这一局的货币、基准价目、合法配方）与
     *   `judge`（这一局的判定维度与是否启用判定）。**执行器读它们**，不再读死常量。
     *   旧五张**刻意不声明**这两个槽位 —— 未声明时执行器原样沿用旧常量，
     *   旧档语义逐字不变（不把已有银元自动改名成另一种资产）。
     */
    history: {
      cn: '历史', core: '身份与规矩、人情往来、粮价与徭役',
      themes: ['history'], extraThemes: ['urban'],
      policies: ['fact-priority', 'cost-bearing', 'deadline', 'escalate-slow'],
      kinds: ['wait', 'rest', 'move', 'meet', 'tell', 'work', 'deliver'],
      resources: ['银元', '粮', '布'],
      engines: ['opportunity', 'world', 'org', 'act', 'economy', 'intel'],
      optional: ['regional', 'trends', 'eraCycle'],
      economy: {
        money: '银元',
        goods: { '米': 0.06, '面': 0.09, '布': 0.35, '面点': 0.15, '成衣': 0.9 },
        recipes: {
          '面点': { in: { '面': 2 }, out: { '面点': 3 } },
          '成衣': { in: { '布': 2 }, out: { '成衣': 1 } }
        }
      },
      // 历史题材不强制数值判定（非数值叙事可关闭属性判定）。
      judge: { enabled: false, attrs: [], labels: {} },
      scenes: [
        { id: 'hist-grain-price', title: '粮价与征调', prompt: '入秋粮价被人为压低，而征调的单子已经到了里正手里；压价的人与收粮的是同一个。' },
        { id: 'hist-two-names', title: '两份名籍', prompt: '同一个人在两处用了不同的名籍，两处都有人替他作证，而两处的差役都在找他。' },
        { id: 'hist-wrong-door', title: '走错门的信', prompt: '一封信被送到同名不同户的人家，拆开的人看懂了里面的内容，却不知道收信人是谁。' }
      ],
      boundaries: ['不该知道征调名册背后的真实用意（只能从经手人的行为推断）',
        '不该知道两份名籍里哪一份是真的——只能知道它们对不上',
        '不该把「听说」当成已经核实'],
      acceptance: [
        { layer: 'state', id: 'hist-a1', text: '同一件货在同一地点的基准价取自本配方价目表；表外资源首次登记仍须显式给基础价（missing-base）。' },
        { layer: 'state', id: 'hist-a2', text: '货币名取自本配方（银元）；旧档未声明经济面时执行器沿用旧常量，余额不被换算。' },
        { layer: 'gen', id: 'hist-a3', text: '相同起点下，带来源的说法与无来源的说法在正文里可区分。' },
        { layer: 'gen', id: 'hist-a4', text: '判定面关闭时，正文不出现属性检定式表述。' }
      ]
    },
    scifi: {
      cn: '科幻', core: '信用点与配额、封舱与延误、授权与追溯',
      themes: ['scifi'], extraThemes: [],
      policies: ['fact-priority', 'cost-bearing', 'deadline', 'intel-source'],
      kinds: ['wait', 'rest', 'move', 'meet', 'tell', 'work', 'deliver'],
      resources: ['信用点', '合金', '元件'],
      engines: ['opportunity', 'world', 'org', 'act', 'economy', 'freight'],
      optional: ['regional', 'trends', 'quota'],
      economy: {
        money: '信用点',
        goods: { '合金': 40, '元件': 120, '组件': 200 },
        recipes: { '组件': { in: { '合金': 2, '元件': 1 }, out: { '组件': 1 } } }
      },
      judge: { enabled: true, attrs: ['body', 'sense', 'mind', 'will'],
        labels: { body: '体魄', sense: '感知', mind: '心智', will: '意志' } },
      scenes: [
        { id: 'scifi-quarantine', title: '封舱待查', prompt: '货舱检测出未知读数，按规定必须封舱待查；而封舱会让下一站的人在窗口期之后才拿到补给。' },
        { id: 'scifi-credit-gap', title: '信用点缺口', prompt: '账上缺口与一次未申报的转出金额一致，而那笔转出的授权码属于一个已经离职的人。' },
        { id: 'scifi-late-signal', title: '迟到的信号', prompt: '一段信号在既定延迟之外到达，内容指向一件尚未发生的事。' }
      ],
      boundaries: ['不该知道检测读数的成因（只能知道读数本身与规程）',
        '不该知道离职者的去向与动机（只能从授权记录推断）',
        '不该把「尚未发生」当成已经确定'],
      acceptance: [
        { layer: 'state', id: 'scifi-a1', text: '同一件货的货币名取自本配方（信用点），与历史局的银元互不影响（两局独立）。' },
        { layer: 'state', id: 'scifi-a2', text: '本配方新增的「组件」配方可被供应链执行（输入取自本配方价目表，未知配方仍 unknown-recipe）。' },
        { layer: 'gen', id: 'scifi-a3', text: '相同起点下，按规程处置与绕开规程会走向不同的正文后果。' },
        { layer: 'gen', id: 'scifi-a4', text: '判定面启用时属性名只认本配方声明的四个（旧六属性不再被接受）。' }
      ]
    },
    xianxia: {
      cn: '仙侠', core: '灵石与丹材、门规与人情、修为与道心',
      themes: ['xianxia'], extraThemes: [],
      policies: ['cost-bearing', 'deadline', 'intel-source', 'escalate-slow'],
      kinds: ['wait', 'rest', 'move', 'meet', 'tell', 'work', 'deliver'],
      resources: ['灵石', '灵草', '丹砂'],
      engines: ['opportunity', 'world', 'org', 'act', 'economy', 'blackbox'],
      optional: ['enemy', 'regional', 'eraCycle'],
      economy: {
        money: '灵石',
        goods: { '灵草': 5, '丹砂': 12, '聚气丹': 30 },
        recipes: { '聚气丹': { in: { '灵草': 2, '丹砂': 1 }, out: { '聚气丹': 1 } } }
      },
      judge: { enabled: true, attrs: ['gen', 'qi', 'shen', 'dao'],
        labels: { gen: '根骨', qi: '气海', shen: '神识', dao: '道心' } },
      scenes: [
        { id: 'xianxia-missing-herb', title: '丹房缺一味', prompt: '开炉前发现缺一味药，替代品两处都有：一处来路不明，一处要欠一个人情。' },
        { id: 'xianxia-sect-rule', title: '门规与私交', prompt: '门规要求上报，而上报会让同门被逐；当事人并不知道你已经知道。' },
        { id: 'xianxia-before-tribulation', title: '雷劫前的托付', prompt: '同门托付一物，明说若自己回不来就转交；三日后雷劫将至。' }
      ],
      boundaries: ['不该知道丹材的真实来路（只能从经手人与价目推断）',
        '不该知道同门隐瞒的事——只能从其行为与时间表推断',
        '不该把「听说」当成已经核实'],
      acceptance: [
        { layer: 'state', id: 'xianxia-a1', text: '货币名取自本配方（灵石），基准价目表内的资源可免显式基础价登记。' },
        { layer: 'state', id: 'xianxia-a2', text: '「聚气丹」配方可被供应链执行；未声明的配方仍 unknown-recipe。' },
        { layer: 'gen', id: 'xianxia-a3', text: '相同起点下，欠人情与买来路不明的货会走向不同的正文后果。' },
        { layer: 'gen', id: 'xianxia-a4', text: '判定面属性名为本配方声明的四个（根骨/气海/神识/道心），旧六属性不再被接受。' }
      ]
    }
  };
  /** 来源参照：主题模块清单的真源在 theme.js（不复制一份，避免两处漂移）。 */
  const SOURCE_FILES = { themes: 'engines/theme.js', kinds: 'engines/act.js', org: 'engines/org.js' };

  /**
   * ── v2.231.0（优化 OPT-8）：扩展题材与「执行器读当前世界定义」────────────────
   *   现场缺口（开工前逐条复核，不是静态推测）：
   *     · `engines/economy.js` 的货币是**写死的常量**（`MONEY='银元'`）、配方是**写死的两行**
   *       （面包 / 铁器）—— 现代校园、历史、仙侠或科幻局都被底层固定词汇拉回同一种游戏；
   *     · `engines/fate.js` 的属性白名单写死 `str/dex/con/int/wis/cha`，`evalFormula` 只认它；
   *     · 本模块的五张配方**没有一处声明货币 / 资源 / 配方 / 判定维度** ⇒ 执行器无从读取，
   *       「题材」只改模块清单，改不了世界里的词汇。
   *   本块的形态：配方多两个槽位（`economy` / `judge`），执行器改为**读当前世界的声明**；
   *   未声明时**原样沿用旧常量**（旧档语义逐字不变，不自动把已有银元改名成另一种资产）。
   */
  /**
   * 题材真源目录：**就是 `theme.THEMES` 那一份**（不是本模块另存一份，也不往它上面补键）。
   *   扩展题材（现代 / 历史 / 科幻 / 仙侠）由 v2.231.0（OPT-8）**加进真源本身**，
   *   与内建五张同处一张表 —— 因为 `theme.apply/preview/compose` 是模块组合的唯一写口，
   *   题材不在那张表里，apply 就会静默忽略它（「配方的题材集合」与「实际组合出来的模块」
   *   当场分叉，而两边各自都报成功）。
   *   真源缺席（theme 未装载）⇒ 返回 null：题材面**核不了**，如实留白，
   *   既不假称「题材都不在」，也不假称通过。
   */
  function themeCatalog() {
    return (WA.theme && WA.theme.THEMES) ? WA.theme.THEMES : null;
  }
  /** 扩展题材名（真源在 theme.js 的 THEME_EXT；本模块只读，用于标注「这张是扩展的」）。 */
  function extendedThemes() {
    return (WA.theme && WA.theme.THEME_EXT) ? WA.theme.THEME_EXT : null;
  }
  /**
   * 经济面：这一局用什么货币、有哪些基准价目、哪些配方合法。
   *   未声明 ⇒ 如实拒收 `no-economy`（**不回落成银元** —— 回落会让「这一局声明了元」
   *   与「这一局没声明」在读数里长得一样，正是本仓点名的失效形态）。
   */
  function economySpec(name) {
    const k = String(name || settings().name || '');
    if (!known(k)) return { ok: false, reason: 'unknown-recipe', unknown: k, known: Object.keys(RECIPES) };
    const e = RECIPES[k].economy;
    // 只读口**不记 stat**：catalogView 会逐张配方调用本函数，一次「看目录」就把拒收计数刷满 ——
    //   那是观测污染被观测者（与仓内 perfTrace.partial 不接注入链同一条纪律）。
    if (!e || typeof e !== 'object' || !e.money) return { ok: false, reason: 'no-economy', name: k };
    const goods = {}, recipes = {};
    Object.keys(e.goods || {}).forEach(function (r) {
      const v = Number(e.goods[r]);
      if (isFinite(v) && v > 0) goods[r] = v;          // 非正数不是价 —— 静默丢掉而不是当成 0（0 会让带宽恒为 0）
    });
    Object.keys(e.recipes || {}).forEach(function (r) {
      const row = e.recipes[r];
      if (!row || !row.in || !row.out) return;         // 形状不对的配方**不进目录**（宁可 unknown-recipe，也不立一条半成品）
      recipes[r] = { in: Object.assign({}, row.in), out: Object.assign({}, row.out) };
    });
    return { ok: true, name: k, money: String(e.money), goods: goods, recipes: recipes, source: 'recipe:' + k };
  }
  /**
   * 判定面：这一局的判定维度，以及判定本身是否启用。
   *   **属性名必须是 ASCII 标识符** —— 这是求值器的机制边界（`evalFormula` 用 `[a-z_]+` 提标识符、
   *   用 `\b` 定界），中文属性名**过不了**求值器。故这里就按求值器口径过滤，
   *   不假装支持：能过的留下，过不了的当场不算数（而不是等调用方在 `evalFormula` 上撞 unknown-attr）。
   *   显示名另走 `labels`（`gen` → 「根骨」）。
   */
  function judgeSpec(name) {
    const k = String(name || settings().name || '');
    if (!known(k)) return { ok: false, reason: 'unknown-recipe', unknown: k, known: Object.keys(RECIPES) };
    const j = RECIPES[k].judge;
    if (!j || typeof j !== 'object') return { ok: false, reason: 'no-judge', name: k };   // 只读口不记 stat（同上）
    const raw = Array.isArray(j.attrs) ? j.attrs : [];
    const attrs = [], dropped = [];
    raw.forEach(function (x) {
      const s = String(x);
      if (/^[a-z_]+$/.test(s) && attrs.indexOf(s) < 0) attrs.push(s); else dropped.push(s);
    });
    const labels = {};
    Object.keys(j.labels || {}).forEach(function (x) { if (attrs.indexOf(x) >= 0) labels[x] = String(j.labels[x]); });
    return { ok: true, name: k, enabled: j.enabled !== false, attrs: attrs, labels: labels,
      dropped: dropped, source: 'recipe:' + k };
  }
  /**
   * 前置自洽判定：**「我声明了」不等于「它真在那儿」**。
   *   逐条机械核对四类可静态判定的事（题材在真源里 / 行动词汇在 act.KINDS 里 /
   *   经济面自洽：配方输入输出的每件货都有基准价 / 判定面自洽：启用了就得有合法属性名）。
   *   判不了的**如实进 `unknown`**（如 act 未装载时行动词汇核不了），不假装缺席、也不假装通过。
   *   本函数**只读**，不改世界、不改设置。
   */
  function satisfied(name) {
    const k = String(name || '');
    if (!known(k)) return { ok: false, reason: 'unknown-recipe', unknown: k, known: Object.keys(RECIPES) };
    const r = RECIPES[k], spec = specOf(k);
    const themes = themeCatalog();   // 只读口不记 stat（同上）
    const missing = [], unknown = [], fallback = [];
    if (!themes) unknown.push({ kind: 'theme', id: '*', why: 'theme 未装载，题材真源未核' });
    else spec.themes.forEach(function (x) { if (!themes[x]) missing.push({ kind: 'theme', id: x, why: '题材真源里没有它' }); });
    const actKinds = (WA.act && Array.isArray(WA.act.KINDS)) ? WA.act.KINDS : null;
    if (actKinds) {
      spec.kinds.forEach(function (x) { if (actKinds.indexOf(x) < 0) missing.push({ kind: 'kind', id: x, why: '不在 act.KINDS 内' }); });
    } else {
      unknown.push({ kind: 'kind', id: '*', why: 'act 未装载，行动词汇未核' });
    }
    const eco = economySpec(k);
    if (!eco.ok) {
      // 未声明 = **沿用旧常量**（旧档语义逐字不变），不是不自洽 —— 两者分开记，
      //   否则旧五张会被一律报成「有缺陷」，真正的对不上反而淹在里面。
      fallback.push({ kind: 'economy', why: '未声明经济面 ⇒ 执行器沿用旧常量（银元 / 面包·铁器两行配方）' });
    } else {
      Object.keys(eco.recipes).forEach(function (rn) {
        ['in', 'out'].forEach(function (side) {
          Object.keys(eco.recipes[rn][side]).forEach(function (g) {
            if (!Object.prototype.hasOwnProperty.call(eco.goods, g)) {
              missing.push({ kind: 'goods', id: g, why: '配方「' + rn + '」的' + (side === 'in' ? '输入' : '产出') + '没有基准价' });
            }
          });
        });
      });
    }
    const jd = judgeSpec(k);
    if (!jd.ok) fallback.push({ kind: 'judge', why: '未声明判定面 ⇒ 执行器沿用旧白名单（str/dex/con/int/wis/cha）' });
    else if (jd.enabled && !jd.attrs.length) missing.push({ kind: 'judge', id: k, why: '判定面已启用却没有合法属性名（属性名须为 ASCII 标识符）' });
    if (jd.ok && jd.dropped.length) unknown.push({ kind: 'attr', id: jd.dropped.join(','), why: '属性名过不了求值器口径（非 ASCII 标识符），未计入判定面' });
    return { ok: true, name: k, cn: r.cn, satisfied: missing.length === 0,
      missing: missing, unknown: unknown, fallback: fallback,
      themeSource: 'theme.THEMES（本模块注册扩展题材）' };
  }

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
    const themes = themeCatalog();   // v2.231.0（OPT-8）：扩展题材一并纳入（否则新配方恒被记 stale）
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
    // v2.258.0（OPV6-3）：配方不再只是「把题材交给 theme.apply」——题材现在**真开引擎**，
    //   配方必须把这件事如实转达给玩家（否则「配方已应用」与「机制真跑起来」又分家）。
    //   口径：部分成功就是部分成功，原样透传 partial / notEffective / notInjected，
    //   不在这里折成「已应用」（本仓纪律③：档位不是开关）。
    const ta = themeApplied || null;
    const partial = !!(ta && ta.partial);
    if (partial) stat.lastReason = 'tier-partial';
    return { ok: true, name: k, cn: RECIPES[k].cn, themes: spec.themes.slice(),
      policies: spec.policies.slice(), themeApplied: ta ? { ok: true, themes: ta.themes,
        enginesOn: (ta.enginesOn || []).slice(), enginesOff: (ta.enginesOff || []).slice(),
        notEffective: (ta.notEffective || []).slice(), notInjected: (ta.notInjected || []).slice(),
        partial: !!ta.partial, partialReason: ta.partialReason || '', noop: !!ta.noop } : null,
      // 引擎面平铺一份（面板直接读，不必再解 themeApplied 那层）
      enginesOn: ta ? (ta.enginesOn || []).slice() : [],
      partial: partial, partialReason: partial ? (ta.partialReason || 'tier-partial') : '',
      saved: r,
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
      // v2.231.0（OPT-8）：扩展题材目录 + 每张配方的经济面 / 判定面 / 前置自洽（只读）
      themeCatalog: Object.keys(themeCatalog() || {}).sort().map(function (x) {
        const ext = extendedThemes();
        return { key: x, label: ((themeCatalog() || {})[x] || {}).label || x, extended: !!(ext && ext[x]) };
      }),
      economyOf: Object.keys(RECIPES).map(function (x) { const e = economySpec(x); return e.ok ? e : { ok: false, name: x, reason: e.reason }; }),
      judgeOf: Object.keys(RECIPES).map(function (x) { const j = judgeSpec(x); return j.ok ? j : { ok: false, name: x, reason: j.reason }; }),
      satisfiedOf: Object.keys(RECIPES).map(function (x) {
        const s = satisfied(x);
        return { name: x, satisfied: !!s.satisfied, missing: (s.missing || []).length,
          unknown: (s.unknown || []).length, fallback: (s.fallback || []).length };
      }),
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
    // v2.231.0（OPT-8）：执行器读当前世界定义的三个只读口 + 扩展题材表
    //   （消费方：economy / fate / supply-chain 读前两个，面板与诊断读全部）
    themeCatalog: themeCatalog, economySpec: economySpec, judgeSpec: judgeSpec, satisfied: satisfied,
    extendedThemes: extendedThemes,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (WA.log) WA.log('info', '题材配方已加载');
})();