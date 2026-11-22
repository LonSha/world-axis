# WorldAxis 优化提升计划：OPV19-1 至 OPV19-9
> **工程归属**：WorldAxis 活世界引擎系统 (`/home/user/wa_opt1`)  
> **基线**：`v2.340.0` / commit `c03969e`  
> **核心哲学**：框架中立，全题材通用（Genre-Neutral Architecture）  
> **实施纪律**：**双计划全部完成前，不执行全量回归（`node tests/run.js`）**。聚焦定向专锁、行为真源断言与局部闭环收口。测试门禁与死导出审计属于默认交付条件，不占 18 项名额。

---

### OPV19-1 · 宏观通胀商路断供与囤积居奇物价传导
- **现状底座**：`engines/economy.js` 的 `price` 和 `tick` 仅依赖当前库存基础定价，且带宽 `spreadPct` 限制孤立在单一地点内。当外部商路阻断、战争围城或发生特大灾害时，无法引起跨地域物资短缺和奸商囤积居奇导致的指数级物价脉冲。
- **本期改造**：
  1. 引入宏观贸易冲击机制（`simulateTradeShock`）：当关联商路状态变为 `blocked` 或 `raided` 时，必需品（粮草、伤药、盐铁）进入囤积恐慌阶段；
  2. 支持弹性溢价突破：在极端断供事件下，允许短缺乘数（`scarcityMultiplier`）按物资刚需度线性累加，突破常规 `spreadPct` 达到平时的 3~10 倍；
  3. 黑市走私溢价传导：当正规商铺断货时，自动向黑市暗仓（`blackmarket`）分流存量，驱动黑市价格狂飙。
- **调度接口**：
  - `economy.simulateTradeShock(locationId, shockSpec)`
  - `actionDesk: econ.simulateTradeShock`
- **验收旅程与负控制**：
  - 正向：某城商路被断绝 5 天，粮食库存跌破警戒线，粮价飙升 400%，市民购买力耗尽引发治安骚乱；
  - 负控制：商路畅通且库存充沛（`supplyRatio >= 1.0`）时，恶意调用贸易冲击断言被拦截（`refusal: 'stable-supply-no-shock'`）。

---

### OPV19-2 · 战术碰撞与随身行囊耗材双向损耗联动
- **现状底座**：`engines/tactical-combat.js` 仅抽象计算姿态平衡与部位伤害，而 `engines/personal-inventory.js` 仅记录物品格子，二者处于割裂状态；战斗格挡不磨损武器，受重伤不消耗急救物资。
- **本期改造**：
  1. 建立攻防对抗与行囊耐久（`gearDurability`）的双向绑定写口：强攻被重兵器格挡时，双方武器即时扣除耐久值，耐久归零直接断裂移入废铁槽；
  2. 创伤即刻耗材结算：当受到大出血（`bleeding`）或骨折（`fracture`）时，系统自动检查背包中的止血带、绷带或夹板；有药剂时自动提供即时包扎减免，无耗材时流血加剧。
- **调度接口**：
  - `tacticalCombat.linkInventoryAttrition(actorId, combatResult, inventoryRef)`
  - `personalInventory.consumeSurvivalGear(actorId, traumaType)`
- **验收旅程与负控制**：
  - 正向：剑客招架重锤打击，佩剑耐久扣减 35 点；腰间绷带在被划伤后自动触发止血消耗；
  - 负控制：空手或未装备护具角色强行格挡重兵器锋刃，断言禁止触发武器耐久抵扣，并直接判定肢体严重骨折与挫伤。

---

### OPV19-3 · 水文洋流与声学视口在空间拓扑的级联感知
- **现状底座**：`engines/spatial-topology.js` 的视口遮蔽与 `engines/room-acoustics.js` 的声学衰减仅计算固态墙体，未与天候、降水及洋流流向联动。
- **本期改造**：
  1. 引入流体与气象对感官的动态遮蔽（`evaluateSensoryOcclusion`）：暴雨、飞瀑与海浪轰鸣直接提高环境底噪分贝，完全掩盖近距离潜行脚步声；
  2. 浓雾、黑夜与浓烟产生视锥距离动态衰减（视距从 50m 压缩至 3m）；
  3. 顺风/逆风对气味与细微声音的传播方向产生指向性增益或衰减。
- **调度接口**：
  - `spatialTopology.evaluateSensoryOcclusion(sourceId, targetId, envCondition)`
  - `roomAcoustics.calculateWeatherMasking(decibel, weatherType)`
- **验收旅程与负控制**：
  - 正向：在暴雨雷鸣中，刺客在目标身后 2 米处奔跑，环境底噪 85dB 完全掩盖脚步声（15dB），暗杀潜行成功率判定为 100%；
  - 负控制：在寂静空旷室内（底噪 < 20dB），未放轻脚步强行潜行断言必被察觉（`detected: true`）。

---

### OPV19-4 · 剧情暗流与历法重大节庆/天文异象共振
- **现状底座**：`engines/undercurrent-calendar.js` 的暗流阶段独立按天推进，与 `engines/calendar-custom.js` 中的月相、节气、丰收祭典或日食互不相干。
- **本期改造**：
  1. 暗流与历法共振器（`alignWithFestival`）：特定暗流（如异教血祭、王室刺杀、工人大罢工）绑定天文或历法窗口；
  2. 节庆效应：节庆期间守备松懈度、人流密集度与集会热度按倍率放大；
  3. 异象触发：月圆之夜狼人狂暴暗流推进步长加倍；冬至极夜刺杀暗流潜伏时间延长。
- **调度接口**：
  - `undercurrentCalendar.alignWithFestival(currentId, festivalSpec)`
  - `calendarCustom.matchUndercurrentResonance(date)`
- **验收旅程与负控制**：
  - 正向：阴谋暗流在“元宵灯会”当天触发人潮拥挤共振，刺杀暗流直接跃迁至“成形”阶段并享受隐蔽掩护；
  - 负控制：非节庆普通工作日（无任何集会声明），强行调用大型狂欢集会掩护断言直接拒绝。

---

### OPV19-5 · 多角色深度疲劳代偿与睡眠剥夺生理崩溃
- **现状底座**：`engines/human-realism.js` 中疲劳度 `fatigue` 仅线性增长并略微扣除工作效率，角色即使连续三天不睡也不会发生昏厥与认知解离。
- **本期改造**：
  1. 引入睡眠剥夺阶梯病理学（`applySleepDeprivation`）：
     - 24 小时未眠：注意力涣散、微表情失控、测谎应激值上升；
     - 48 小时未眠：出现幻视幻听、手部震颤、理智值大幅滑坡；
     - 72 小时未眠：触发身体强制宕机睡眠（`narcolepsyCrash`），无论处于战场还是谈判当场昏厥；
  2. 咖啡因/兴奋剂临时透支代偿机制：服药可压制疲劳，但药效过后承受双倍反噬折算。
- **调度接口**：
  - `humanRealism.applySleepDeprivation(actorId, hoursAwake)`
  - `actionDesk: bio.applySleepDeprivation`
- **验收旅程与负控制**：
  - 正向：哨兵连续守夜 72 小时无补觉，在敌军夜袭前夕触发强制昏睡抗拒判定失败，跌入深睡状态；
  - 负控制：睡眠充沛刚醒的角色（`hoursAwake < 4`），断言禁止触发任何疲劳昏厥病理。

---

### OPV19-6 · 酷吏刑讯反噬与人际网络不可逆仇恨决裂
- **现状底座**：`engines/interrogation-tell.js` 仅仲裁供词真伪，审讯结束后对审讯者与受害者之间的羁绊无实质惩处，受害者亲属毫无察觉。
- **本期改造**：
  1. 引入刑讯创伤反噬（`applyBacklashGrudge`）：严刑拷打（电刑、烙铁、夹棍）对受审者施加永久心理残疾（`permanentPTSD`）与极端死仇（`bloodGrudge`）；
  2. 派系与家族声誉决裂：受审者被屈打成招或残害的消息走漏后，其家族、师门或同盟与审讯者好感度瞬间归零并转为永久敌对；
  3. 杜绝招供后“相逢一笑泯恩仇”的荒谬剧情。
- **调度接口**：
  - `interrogationTell.applyBacklashGrudge(inquestId, interrogatorId, suspectId)`
  - `bonds.severTrustFromTorture(interrogatorId, suspectId, severity)`
- **验收旅程与负控制**：
  - 正向：官差动用酷刑强行撬开侠客嘴巴，受害者招供但埋下绝死仇恨；其门派获悉后立刻将审讯官列入暗杀榜首；
  - 负控制：合法的温和谈话问询（`tortureSeverity == 0`），断言禁止派生不可逆的血仇追杀标记。

---

### OPV19-7 · 野兽趋利避害与定居点灯火防护哨卫结界
- **现状底座**：`engines/ecosystem-predation.js` 中野兽捕食仅根据距离最近的猎物发起攻击，即便村庄有围栏、篝火和猎枪也无脑自杀式冲锋。
- **本期改造**：
  1. 建立定居点周边威慑判定（`checkPerimeterDeterrent`）：包括篝火（`fireDeterrent`）、高耸木栅栏（`barrier`）、钟声/号角（`acousticWarning`）；
  2. 野兽在饥饿度尚未突破狂暴阈值（`frenzyThreshold`）前，接近火光边缘时本能产生恐慌值并回退折返；
  3. 只有极度饥饿濒死或受异化侵蚀狂化的猛兽，才会冒险跨越火线。
- **调度接口**：
  - `ecosystemPredation.checkPerimeterDeterrent(beastId, settlementId, envSpec)`
  - `spatialTopology.queryDefensePerimeter(settlementId)`
- **验收旅程与负控制**：
  - 正向：普通饥饿狼群被营地三堆熊熊篝火逼退在 10 米外低吼徘徊，不敢贸然突入帐篷；
  - 负控制：面对毫无灯火与防具的野外露营者，狼群断言绝对不会凭空逃逸。

---

### OPV19-8 · 跨插件真源快照增量脏标记同步优化
- **现状底座**：`engines/bridge.js` 在向 LonSha 或 RubyPhone 广播事件时，常序列化全量上下文，造成高频推演时的内存震荡与性能卡顿。
- **本期改造**：
  1. 引入增量脏标记队列（`dirtyQueue` 与 `flushDirtySnapshots`）；
  2. 仅当发生关键世界事实（血契生效、重伤残疾、通缉令颁布、战局翻盘）时，才打包定向事件投影至 LonSha；
  3. 仅当发生通信拦截、眼线密函或公开悬赏时，才唤醒 RubyPhone 虚拟通讯事件，节约系统算力。
- **调度接口**：
  - `bridge.markDirtyDomain(domain, entityId)`
  - `bridge.flushDirtySnapshots()`
- **验收旅程与负控制**：
  - 正向：连续 10 次微小步进不产生多余通信快照；在发生暗杀事件瞬间精准推送单条原子因果事实；
  - 负控制：没有任何脏标记时的刷新调用，断言返回 `flushedCount: 0`，不执行任何无效 I/O。

---

### OPV19-9 · 沉浸式健康创伤态势与暗网通缉原生折叠面板
- **现状底座**：`ui/panel.js` 此前已完成专家工具折叠，但 V19 新增的病理感染、外科缝合状态、黑市信用分与间谍伪装值尚无统一展现入口，若随意散落会再次造成界面混乱。
- **本期改造**：
  1. 延续完全去工程化原则，使用 `<details class="wa-details">` 原生折叠层收拢 V19 复杂数据；
  2. 标题平民化：“身体创伤与病理诊查”、“隐秘市集与商誉信用”、“暗中潜伏与眼线网络”；
  3. 零测试污染：所有挂载保持 ID 与属性契约，确保无头门禁与交互测试双重安全。
- **调度接口**：
  - `panel.renderV19ImmersionFold()`
  - `#wa-immersion-v19-wrap`
- **验收旅程与负控制**：
  - 正向：玩家展开“身体创伤”能一目了然看清断骨包扎进度与感染率，折叠后界面毫无视觉负担；
  - 负控制：折叠面板内不得包含任何内部调试编号（如 `OPV19`、`EX19` 等代号），断言校验文本纯净度。
