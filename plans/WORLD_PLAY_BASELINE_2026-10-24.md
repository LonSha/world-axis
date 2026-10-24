# WorldAxis 世界玩法规划：现场基线、增量边界与三大更新排程

日期：2026-10-24。本文是有日期的调查快照和 **proposed 排程**，不是自动同步的当前读数，也不是功能交付报告。
任务正文只在[优化提升九项 WP](WORLD_PLAY_DEPTH_9.md)与[拓展创新九项 WX](WORLD_EMERGENCE_9.md)维护，严格各九项。

## 基线和调查范围

- 工作目录 `/home/user/wa_opt1`，分支 `master`；调查起点 HEAD 和 `origin/master` 均为 `319356e0cb8e5f2d869819780d0b87f580698342`。远端为 `LonSha/world-axis`。
- `index.js` / `manifest.json` 的运行版本均为 `2.231.6`，manifest buildId 为 `8066b342de86`。提交说明写 `2.231.8` 不等于运行元数据；本次不借规划修改版本。
- 旧计划基线仍为 `c6ff687` / `2.231.0`，无法代表当前能力。十八项相关实体已经存在，但不能一律判为完整交付或一律重做。
- 本轮覆盖主要 owner、正常调用点、六个专项和五组补充行为探针；不是全仓逐行审计。静态未见调用仅限列出的链路，不推导“全仓绝无此能力”。
- 未运行 `node tests/run.js` 全量回归；未进行真实 SillyTavern、手机、跨会话 UI 验收。计划的验收条件是未来工作，不能搬来当本次实测。
- 本轮只改计划、入口、决策关联与证据附件；不修改产品、现有测试、配置、导出契约或版本。证据脚本不接入产品回归，不创建新的守卫体系。

## 行为证据：局部全绿不等于整条玩法成立

六个专项分别在独立 Node 进程运行，全部退出码 0。原始观察与复算命令分开：下表是 2026-10-24 快照，不是永久断言。

| 命令（仓库根目录） | 本轮通过/失败 | 能证明的范围 |
|---|---:|---|
| `node tests/exp10-action-desk-v2232.js` | 35/0 | 已有行动聚合、具名路由等专项判据 |
| `node tests/exp11-action-methods-v2232.js` | 38/0 | 方法资格与工具等局部行为 |
| `node tests/exp12-labor-schedule-v2232.js` | 20/0 | 预约表内规则，不代表全业务消费 |
| `node tests/exp18-aftermath-impact-v2232.js` | 21/0 | 后果接口专项，不覆盖未知维修目标的外层语义 |
| `node tests/exp22-scene-narrative-v2232.js` | 26/0 | 场景接口专项，不代表实际到场/获知过滤 |
| `node tests/exp24-playable-blueprint-v2232.js` | 32/0 | 样例查询/依赖接口，不代表开局安装成功 |
| 合计 | **172/0** | 仅上述六项；不是全量回归 |

[五组探针源码](evidence/2026-10-24/behavior-probes.cjs)和[原始观察 JSON](evidence/2026-10-24/observed-baseline.json)已随规划保存。复算：

```sh
node plans/evidence/2026-10-24/behavior-probes.cjs /tmp/wa-plan-probes-new.json
```

探针装载真实仓库模块与 `tests/mock.js` / `ui-gate-sync.js.fresh()`，数据为临时夹具，不连接真实聊天。`observed` 和退出码 0 表示**缺口按预期被观察到**，不是产品通过验收。后续缺口修复后探针可能退出非零，须更新调查解释或转成正式业务判据，不能为保住“绿灯”恢复错误行为。时间戳、随机身份等字段不要求与旧 JSON 逐字相同。

| 探针 | 本轮观察 | 不应夸大的边界 |
|---|---|---|
| `repair-unknown-effect` | 外层 `ok:true,repaired:true`，内层 `aftermathResult.ok:false,reason:not-found` | 明确返回语义错误；不是已修复 |
| `method-accepts-missing-target-and-recharges` | 不存在目标仍成功；同样 opId 重调，耐久 10→8→6 | 当前接口未承诺使用 opId；准确结论是缺目标兑现/操作身份语义，不是破坏已有幂等契约 |
| `labor-clock-is-separate` | 剧情钟设第七日，预约推进为第二日，剧情日未变 | 应统一现有剧情依据，不建第三个钟 |
| `scene-observer-and-place` | 两地人物夹具仍同列在场；无观察者获知记录的公开远方条目仍被列出 | 位置夹具未完整经 world owner 安排，不能说是真实宿主到场复现；源码直接取前六人/公开条目支持过滤缺口 |
| `blueprint-ready-with-disabled-owner` | training 关闭，仍 `canStart:true` 并提示必要引擎就绪 | 检查的是对象存在，不等于定义安装、功能启用或整包可玩 |

## 优化线证据与 owner 归属

<a id="e01"></a>
### E01：正常行动入口的入参与下一步

读 [action-desk.js](../engines/action-desk.js) 的 `board/fromProduction/plan` 与 [panel.js](../ui/panel.js) 的 `showDesk`。基线面板执行仅传 `{who}`；生产聚合包含 paused 工单并路由 `advance`，生产 owner 要求先复工。五类聚合已存在，缺的是目标/数量/材料/时段等正常输入与连续操作。**静态证据**；六项专项中的 action-desk 全绿不覆盖这些玩家路径。归 WP-1。

<a id="e02"></a>
### E02：方法选择没有兑现目标

读 [action-methods.js](../engines/action-methods.js) 的 `evaluate/execute` 与 [gear.js](../engines/gear.js) 的维修结算。**行为探针**见上表：无目标仍可扣工具并成功。新增具名目标兑现、确认身份和续作语义归 WP-2；资源仍归 gear/production/service 等原 owner，不新增方法库存。

<a id="e03"></a>
### E03：预约日与剧情日分离

读 [labor-schedule.js](../engines/labor-schedule.js) 的 `advanceDay`、[playtime.js](../engines/playtime.js)，并沿生产、旅行消费点定向检索。**行为探针**显示独立计日；预约互斥只是局部能力。WP-3 持有统一日期/时段与结算语义，其他项消费，不重复建调度层。

<a id="e04"></a>
### E04：技艺与制造前置不等于整单履约

读 [research-closure.js](../engines/research-closure.js) 的 `verifyPrereq`、[production.js](../engines/production.js)、[tech-lineage.js](../engines/tech-lineage.js) 的 `canProduce`。设备/技能/预约查询已实现；schedule 只查预约存在，注释声明的 intel 未见独立处理分支，严格模式拒绝未知类型。生产已有材料预留、暂停复工、交货/货运，不能重复宣称缺失。**静态证据**，本轮未重验完整制造链。WP-4 仅取游戏内机械与虚构工艺，不涉及现实生命科学内容。

<a id="e05"></a>
### E05：角色比较、经验与正常决策分离

读 [life.js](../engines/life.js) 的 `decide`、[motive-arbitration.js](../engines/motive-arbitration.js)、[path-echo.js](../engines/path-echo.js)、[epistemic-view.js](../engines/epistemic-view.js)。life 仍按固定条件决定；新评分有独立入口但定向阅读未见其进入正常决策链。path-echo 修改获取的 person，持久化/后续消费需专门证实，不能仅凭此判定存档必丢。epistemic-view 的纠正主要依赖 proofText。**静态疑点，未专项复现**。WP-5 复用 intel/rumor/noesis 的来源与版本，负责个体行为；WX-1 才负责多人竞争。

<a id="e06"></a>
### E06：共同生活需要真实履行

读 [family-ops.js](../engines/family-ops.js)：雇工主要扣款与历史记录，代班未核验转交结果且未占劳动时段；`inheritRatio` 先清来源，再跳过不存在受益人。**静态风险，未复现，不与此前 family 均分修复混淆**。WP-6 负责内部周期、值班与份额；外部互惠 WX-3、多方承继 WX-8 不重做共同池。

<a id="e07"></a>
### E07：修复、地图与服务需要实际恢复功能

读 [aftermath-impact.js](../engines/aftermath-impact.js) 的 `commissionRepair/findDetour`，以及 [service-network.js](../engines/service-network.js)、[world.js](../engines/world.js)。维修外层虚报成功已**行为复现**；默认绕路拼节点、服务激活/恢复主要改状态、queued 为历史数量、degraded 未直接减有效容量、地点检查读 region.places 均为**静态发现**。WP-7 把它们接到真实道路/工位/工单与可续办队列，不把网络图当功能本身。

<a id="e08"></a>
### E08：场景必须有地点与观察者依据

读 [scene-narrative.js](../engines/scene-narrative.js) 的 `currentScene/perceivedHorizon/traceFrom`：人物前六项与公开 horizon 筛选不等于实际到场/已获知；字符串命中也不等于因果引用。**行为探针边界见上表**。WP-8 消费 world.where 与认知来源，并接回既有叙事注入，不建第二份历史或全知事实表。

<a id="e09"></a>
### E09：样例依赖检查不是安装器

读 [playable-blueprint.js](../engines/playable-blueprint.js) 的样例、`checkDependencies/exportPlayDefs` 和 [world-blueprint.js](../engines/world-blueprint.js) 的导入流程。前者主要检查 WA 对象存在、导出摘要，本文件没有把玩法定义安装到 owner 的完整路径。**training 关闭仍可开始已复现**。WP-9 复用后者预览确认，负责定义/运行态分离与真实新局。

## 创新线的已有邻居与增量依据

以下是**静态现状与产品提案**，不是本轮九项创新的行为通过证据，也不是从检索零命中推导全仓不存在。

<a id="e10"></a>
### E10：单人动机不是多人机会竞争

[motive-arbitration.js](../engines/motive-arbitration.js) 接单人候选评分；[agency.js](../engines/agency.js) 持有调度与回执；[ensemble.js](../engines/ensemble.js) 是多模型只读推演仲裁。WX-1 新增竞争对象、分配与落选转向，既有 commission/production 持有任务和稀缺容量。

<a id="e11"></a>
### E11：确认记录不是协作分工的共同版本

[shared-awareness.js](../engines/shared-awareness.js) 的 `assertMeta` 主要检查 basis 类型，`confirmPact` 主要检查参与者；[coop.js](../engines/coop.js) 是本地提议权威确认；[liaison.js](../engines/liaison.js) 已区分 submitted/sent/delivered/known/settled。WX-2 复用这些语义，把所知版本、依赖贡献和协作失败接到真实执行，不重建消息链。

<a id="e12"></a>
### E12：互惠不能重复已有债务和关系修复

[mend.js](../engines/mend.js) 有道歉、补偿、守约和第三方担保；[org.js](../engines/org.js) 有债务/共同项目；[diplomacy.js](../engines/diplomacy.js) 有协议与履约。WX-3 仅增加非等价可拒绝求助与跨事项有限担保的实际消费，不增加第二套债务余额或通用好感货币。

<a id="e13"></a>
### E13：先例要进入下一次真实分配

[custom-lax.js](../engines/custom-lax.js) 的 `reviewRule` 主要记录决定 ID 和改状态；[ruling.js](../engines/ruling.js) 已有真实裁决流程；[inst.js](../engines/inst.js) 持有权限与岗位。WX-4 的增量是已结事项的适用范围、例外与版本，进入工位/项目/活动的实际分配，不把字符串批准当授权。

<a id="e14"></a>
### E14：技术变体标签不等于产品兼容

[tech-lineage.js](../engines/tech-lineage.js) 已有师承、文献、变体与实践者离场；`confirmVariant` 主要检查传入环境布尔条件并置 confirmed。WX-5 要由真实游戏内工单/安装回执支撑离散兼容和改装选择；WP-4 已有的普通制造与培训只复用一次。

<a id="e15"></a>
### E15：已有活动很完整，新增的是跨期地方节奏

[activity.js](../engines/activity.js) 的 plan/open/signup/round/settle/postpone 等已有单期活动状态机，不能把报名与奖励重新立项。WX-6 新增系列身份、下一期生成、跨期准备和订单、场地迁移后果，活动实例仍归原 owner，日期仍归 WP-3。

<a id="e16"></a>
### E16：事实记忆与群体解释分开

[sediment.js](../engines/sediment.js)、[pmem.js](../engines/pmem.js)、[opinion.js](../engines/opinion.js)、[rumor.js](../engines/rumor.js) 是已有历史/记忆/传播基础；[social-legacy.js](../engines/social-legacy.js) 已允许不同见证。WX-7 仅新增有限主张被群体采纳和消费的语义，原事件不可被意见改写，不复制长期记忆系统。

<a id="e17"></a>
### E17：接受范围需要原 owner 真正交接

[social-legacy.js](../engines/social-legacy.js) 的 `acceptLegacy` 更新 acceptStatus/successor/acceptScope 等，所读路径未见物件、任职、项目实际交接。WX-8 结合 gear/inst/org/commission 做多方局部承接，原资产与权限口继续作为真源；WP-6 已处理的内部份额不再计费。

<a id="e18"></a>
### E18：地方发展不是修改 phaseId

[phase-transition.js](../engines/phase-transition.js) 固定三种阶段；collectReadings 取所有活跃传统、将设施容量和称作 coverage，并近似用 regionId 查组织规则。该读取语义仍需实施时重核；阶段标签不能证明真实地区变化。WX-9 首发以机械、服务和商业布局构造两地持续选择，复用已经完成的投资/合同/规则，而不是重做地区总引擎。

## 旧十八项如何处理

旧文件保留历史理由并加醒目标识，不把勾选当现状。下表是本次的**增量归属**，不表示旧项已全部通过、也不表示原代码全无价值。

| 历史项 | 当前可复用基础 | 新计划归属/不重复内容 |
|---|---|---|
| OP-1 场景行动桌 | action-desk 与面板 | WP-1 完整入参和连续办事 |
| OP-2 能力工具联动 | action-methods/gear/training | WP-2 目标兑现与续作 |
| OP-3 劳动日程 | labor-schedule 预约 | WP-3 同一剧情日与跨业务消费 |
| OP-4 游戏内技艺成果 | research-closure/production | WP-4 机械与虚构工艺经营链 |
| OP-5 共同生活 | family/family-ops | WP-6 周期履行，WX-8 外部承继 |
| OP-6 地点后果 | aftermath/aftermath-impact | WP-7 实际功能恢复 |
| OP-7 有限认知 | epistemic-view/intel 等 | WP-5 正常决策，WP-8 可知呈现 |
| OP-8 场景历史 | scene-narrative/chronicle | WP-8 地点与因果来源 |
| OP-9 可玩蓝图 | world-blueprint/playable-blueprint | WP-9 定义安装与七日开局 |
| IN-1 动机竞合 | motive-arbitration | WP-5 个体决策；WX-1 多人竞争 |
| IN-2 经验回声 | path-echo | WP-5 真实结果后的持久学习，不另算创新 |
| IN-3 共同知晓 | shared-awareness | WX-2 分工版本与协调后果 |
| IN-4 习俗制度 | custom-lax/ruling/inst | WX-4 先例实际改变分配 |
| IN-5 技术谱系 | tech-lineage | WP-4 资格消费；WX-5 兼容/改装 |
| IN-6 公共设施 | service-network | WP-7 建设/排队/恢复，不重卖设施名字 |
| IN-7 | 历史实现保留 | 不纳入本轮研发范围，不借旧项扩增十八项 |
| IN-8 社会遗产 | social-legacy/inst/gear | WX-8 多方接受后实际交接 |
| IN-9 历史相变 | phase-transition | WX-9 从实际选择形成地方发展 |

WX-3/6/7 是在既有邻居上的新增跨事项玩法，不是声称 org/activity/记忆机制不存在。旧环境、公开发布链、联网平台和全库治理不再作为本轮扩展方向。

<a id="schedule"></a>
## 三个大更新与净工作量

### 估算口径

十八项合计 **214–322 工程小时**：WP 为 94–140，WX 为 120–182。按单人每天八个有效工程小时折算约 **27–41 个工作日**；预留约 20% 跨模块返工/宿主差异余量后约 **257–387 小时、33–49 个工作日**。这是待实施的初步量级，不是实际用时，不是 AI 墙钟承诺，更不是要故意等待够三天。

这明显超过“至少三天”的体量；不能反过来承诺“三天把十八项全做完”。估算取决于现有 owner 是否能表达上述正常路径。实施第一包后按实测重新估算剩余量，不为维护数字而扩建无关基建。

范围内已含业务实现、正常 UI、旧档/开关处理、无头行为验证和每项必要宿主操作。共享事项只计算一次：WP-1 持有通用操作上下文/表单外壳，WP-3 持有时间与劳动，WP-5 持有个体所知/经验消费，WP-8 持有可知场景，WP-9 持有通用定义安装。WX 只计本身规则、专属 UI 字段与业务适配。测试与修复不另列“第十九项”。

| 更新包 | 净工作量分配 | 估算 | 大更新可玩结果 |
|---|---|---:|---|
| A：人物能安排并完成事情 | WP-1～5：52–78；WX-1/2：28–42；WP-9 安装骨架：4–6 | **84–126 小时** | 同一剧情日内接单、争取机会、安排协作、真实付出并交付；三人七日经营可续玩 |
| B：地方与共同生活运转 | WP-6～8：30–44；WX-3/4/6：36–54 | **66–98 小时** | 四人共同体跨三周期，服务停用与改线、互助、先例、活动系列互相影响 |
| C：长期沉积与地方分化 | WP-9 三包与整局收口：8–12；WX-5/7/8/9：56–86 | **64–98 小时** | 三套可安装玩法包；两地三十回合产生兼容、记忆、交接与投资差异 |
| 合计 | A+B+C，WP-9 两段只算一次 | **214–322 小时** | 十八项验收条件全部仍须逐项满足 |

### 实施次序与前三天的实质工作

- **第 1 个有效工作日**：WP-3 日期/时段基准与旧预约映射，WP-1 现有动作完整入参入口。目标是同一人物的生产/旅行冲突可由正常入口表达并解释，不是只写设计或加断言。
- **第 2 个有效工作日**：WP-2 首族维修实际改目标、取消/重复确认边界；WP-1 接入结果后下一步；WP-3 把真实工时接到生产。目标是工具和目标同时读到正确结果。
- **第 3 个有效工作日**：WP-4 接单→投入→劳动→部分交付的第一条机械工艺链，加入延期/补料并保存重载。完成的是 A 包内部第一条纵向切片，**不是宣称 A 包或十八项已完成**。
- **之后 A 包**：完成 WP-2/3 各类业务覆盖、WP-4 全链、WP-5 真实 NPC 选择；再做 WX-1 的竞争与 WX-2 的共同计划。WP-9 先提供该包的可安装定义骨架，A 包验收走正常宿主入口。
- **B 包**：WP-6/7 先兑现共同体与服务；WP-8 贯穿两地可知场景；WX-3/4/6 依次将求助、规则、周期活动消费这些结果。三周期续玩不是用手工改状态跨过去。
- **C 包**：WX-5/8 的兼容与承接先落实，WX-7 的群体版本消费其真实事件；WP-9 完成三套初值与定义边界，最后 WX-9 做两条地方发展路线的三十回合联合验收。

前三天按八小时有效工作日理解，是开工顺序示例而非固定日期承诺；某条既有 owner 不满足语义时先调整该条切片，不以硬赶时间牺牲真实结果。

### 依赖与交付分层，避免环形等待

1. WP-1 先接已有 owner，WP-3 先固定时间契约，然后 WP-2/4/5 实现；WP-1 后续补动作表单不要求先结束全部业务才能开始。
2. WP-2 的方法机制在 A 包建立；其中“设施抢修”在 B 包 WP-7 实际恢复服务后才联合结项。A 包可以交物件维修与工单加工，不冒充三族全验。
3. WX-1 先以已有生产工位和委托运行，B 包再接公共服务；WX-2 在 A 包有基本当事人反馈，B 包 WP-8 再做全场景可知呈现，不依赖先做完场景系统才验证分工。
4. WP-9 的安装契约在 A 包定形，包内容随 owner 完成逐步加入。WX-9 使用已存在的安装能力；WP-9 最后的联合三十回合是验收关联，不是两者互为实现前置。
5. WX-7 可增强 WX-9 的社会解释，但 WX-9 不以 WX-7 完成为硬前置；避免“所有新机制全开才会动”。关闭可选机制时保留正常经营与明确降级说明。
6. 每包版本号实施时再定；内部可以细提交，面向用户按完整大更新交付，不用“十个新文件”替代一条完整玩家路径。

## 验收要读到什么

每项同时检查：正常 UI/剧情入口 → 真 owner 状态 → 相关人获知 → 失败或替代方案 → 下一时段实际后果 → 保存重载继续。观测目标至少包括相关人物、物件/库存、时段、地点、承担责任和可知叙事，不把 `ok:true`、评分变化或 phase 标签作为唯一依据。

- **源码层**：逐个写入点归属清楚，既有 owner/开关/时间语义被复用。真实输入消费点可追，不只有导出和诊断调用。
- **无头业务层**：正常路径与替代路径都调用真实实现；需要负控制时破坏真实源码副本并重跑同款判据，不用模拟常量冒充。现有全量回归在产品实施轮执行并留足实际耗时窗口。
- **宿主层**：真实 SillyTavern 上从新局或旧局操作，含手机布局、切聊天、保存重载；无头 mini-DOM 不代替这一层。
- **玩家层**：每包连续游玩场景完成，不需要控制台补参数；至少能解释一件“我不在时别人做了什么，以及为什么现在影响我”。

本次规划**没有**后二层验收结果，也没有修复上表缺口。工具日志中出现“pass”只能对应其实际测试范围。

## 笔记校验的既有失败与本轮边界

技能脚本在本轮写新文档前执行，树校验报四条旧链接，格式校验报旧笔记头块/章节问题。基线原文保存为 [树校验](evidence/2026-10-24/note-tree-baseline.txt) 与 [格式校验](evidence/2026-10-24/note-format-baseline.txt)。

四条坏链接来自 2026-10-09 batch2/batch3 两篇中的 `../plans/...`；格式问题涉及这两篇、TX1/2/3/4/6/7/8 及 2026-10-09 beat-engine-family。此次不批量改写历史决策，也不为了清零日志新立治理项目。新笔记必须满足当前格式，复跑后与旧错误集合比较，**不新增失败**；这不等于全树全绿。

规划提交前检查十八项编号、各项工作包/验收/依赖/估算、相对链接和证据锚点、预算加和、改动白名单、无凭据泄露与 `git diff --check`。[本次收口检查](evidence/2026-10-24/README.md)记录实际结果。推送成功与否以实际远端分支哈希核验，不拿本地 commit 当上传证明。
