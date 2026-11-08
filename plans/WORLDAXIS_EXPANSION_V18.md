# WorldAxis 拓展创新计划：EXV18-1 至 EXV18-9
> **工程归属**：WorldAxis 活世界引擎系统 (`/home/user/wa_opt1`)  
> **基线**：`v2.330.0` / commit `9b101d7`  
> **核心哲学**：框架中立，全题材通用（Genre-Neutral Architecture）  
> **实施纪律**：**双计划全部完成前，不执行全量回归（`node tests/run.js`）**。聚焦定向专锁、行为真源断言与局部闭环收口。测试门禁与死导出审计属于默认交付条件，不占 18 项名额。
---
### EXV18-1 · 具身战术交锋与致命要害创伤仲裁引擎
- **落盘核心**：`engines/tactical-combat.js`
- **机制原理**：
  - 普适通用战术对抗模型：角色具备姿态平衡值（`posture` 0～100）、体力槽、防守格挡阻抗与要害部位（头部 `head`、胸腹 `torso`、手臂 `arms`、腿足 `legs`）；
  - 核心战术动作：`strike`（强攻突刺）、`parry`（招架格挡）、`dodge`（闪避）、`feint`（虚招诱骗）、`disarm`（缴械锁技）；
  - 破防时触发物理真实创伤：骨折、大出血、重度脑震荡、行动受阻；
  - 装备耐久度（`gear-wear`）同步承受反震应力，低耐久武器直接断裂；
- **调度写口**：
  - `tacticalCombat.resolveClash(spec)`
  - `actionDesk.act('combat.resolveTacticalClash', spec)`
- **产品体验与负控制**：
  - 体验：刺客夜袭被横刀招架，长剑震断，反手突刺断其左臂造成持续流血；
  - 负控制：背后无知盲区偷袭（`stealth == 100` 且距离 `< 1.5m`），防守方断言绝对无法完美招架（`parry` 判定拒绝）。

---
### EXV18-2 · 微表情伪装破绽与审讯心理击穿引擎
- **落盘核心**：`engines/interrogation-tell.js`
- **机制原理**：
  - 心理防线动力学：嫌疑人具备隐瞒心压（`deceptionStress` 0～100）与心理抵抗（`mentalDefiance` 0～100）；
  - 撒谎时，结合与现场物证（`spatial-trace`）冲突度外溢外显破绽（Tells）：眼神游移、冷汗直冒、语速过快、前后矛盾；
  - 审讯者通过出示物证、心理攻心削减其抵抗力；抵抗力归零时触发心理崩溃全盘招供。
- **调度写口**：
  - `interrogationTell.pressInquest(spec)`
  - `actionDesk.act('interrogate.pressInquest', spec)`
- **产品体验与负控制**：
  - 体验：审讯官出示关键血衣物证，嫌疑人呼吸急促心理崩溃当堂画押；
  - 负控制：审讯方未出示任何关键物证或未形成证据闭环，断言嫌疑人心防绝不凭空决堤。

---
### EXV18-3 · 荒野生物本能捕食与生态链迁徙引擎
- **落盘核心**：`engines/ecosystem-predation.js`
- **机制原理**：
  - 荒野生态链模型：包含掠食者（`predator`）、猎物（`prey`）与食腐者（`scavenger`）；
  - 生物本能机制：饥饿捕食、水源饮水、顺逆风气味追踪、畏光惧火；
  - 寒冬或天灾时猎物绝迹，掠食群兽饥饿度突破阈值主动下山袭村；
  - 营地生火可驱散野兽，但战斗血腥味引来食腐群兽。
- **调度写口**：
  - `ecosystemPredation.simulatePredation(spec)`
  - `actionDesk.act('wild.simulatePredation', spec)`
- **产品体验与负控制**：
  - 体验：暴风雪导致猎物灭绝，狼群饥饿围攻驿站，守卫利用火把与巨响驱退群兽；
  - 负控制：饱食状态野兽在强火光前强行发起灭顶自杀式冲击断言阻断。

---
### EXV18-4 · 宏观围城消耗战与后勤辎重断粮引擎
- **落盘核心**：`engines/siege-attrition.js`
- **机制原理**：
  - 城堡/要塞围攻全流程模型：城防工事（`fortification`）、粮水储备天数（`rationDays`）、卫生疫病（`epidemicIndex`）、军民士气（`morale`）；
  - 进攻方战术：铁桶封锁、投石轰击、地道爆破、水源投毒；
  - 守备方耗竭：粮水见底触发杀马煮革、瘟疫蔓延、最终军心哗变或开城投降。
- **调度写口**：
  - `siegeAttrition.advanceSiege(spec)`
  - `actionDesk.act('siege.advanceSiege', spec)`
- **产品体验与负控制**：
  - 体验：要塞被困三月粮草耗尽，副将因饥饿与瘟疫发动兵变斩杀主将开门迎敌；
  - 负控制：粮草储备充沛（`rationDays > 30`）且无外围封锁，断言禁止触发断粮哗变。

---
### EXV18-5 · 超自然异化侵蚀与道心畸变演化引擎
- **落盘核心**：`engines/anomaly-mutation.js`
- **机制原理**：
  - 框架中立的超常侵蚀机制（面向高魔、修仙、克苏鲁或义体过载）；
  - 侵蚀抗性（`corruptionResist` 0～100）与异化阶位（`mutationTier` 0～5）；
  - 接触不可名状魔神物、强行破关或义体超载，侵蚀度飙升；
  - 畸变赋予超强异能（如鳞甲防御、黑焰撕扯），但伴随幻听发疯与肉体畸形代价。
- **调度写口**：
  - `anomalyMutation.inflictCorruption(spec)`
  - `actionDesk.act('anomaly.inflictCorruption', spec)`
- **产品体验与负控制**：
  - 体验：修士强炼魔核遭反噬，神魂畸变右臂化为魔爪，同时伴随嗜血狂乱幻听；
  - 负控制：身处凡俗环境未接触任何异化源，断言禁止凭空产生异化畸变。

---
### EXV18-6 · 功勋考绩与宗门/官僚派系推举引擎
- **落盘核心**：`engines/bureaucracy-ascension.js`
- **机制原理**：
  - 通用阶层晋升与考绩模型（宗门晋升、朝堂科举考课、财阀合伙人选举）；
  - 考绩四要素：实打实功勋积分（`meritPoints`）、派系高层背书（`factionBacking`）、道德声望（`reputationScore`）、名额配额；
  - 阶层固化阻碍：权贵子弟顶替战功、派系党同伐异阻挠，或通过立下逆天奇功破格晋升。
- **调度写口**：
  - `bureaucracyAscension.evaluateAscension(spec)`
  - `actionDesk.act('org.evaluateAscension', spec)`
- **产品体验与负控制**：
  - 体验：斩妖无数的外门弟子在大比中因得罪执法长老被恶意压制功名，激起众怒；
  - 负控制：功绩积分未达最低硬门槛且无大佬背书，断言晋升直接判定驳回。

---
### EXV18-7 · 司法公审断狱与赏金猎人追捕追凶引擎
- **落盘核心**：`engines/judicial-inquest.js`
- **机制原理**：
  - 犯罪行为完整闭环：通缉悬赏、赏金猎人/捕快跨图追凶、捕获羁押、公堂断狱审判、刑罚执行；
  - 司法审判根据证据链完整度定罪（示众杖刑、服劳役流放、秋后问斩、无罪平反）；
  - 支持“劫法场”与“收买狱卒逃狱”的连带戏剧因果。
- **调度写口**：
  - `judicialInquest.conductInquest(spec)`
  - `actionDesk.act('judicial.conductInquest', spec)`
- **产品体验与负控制**：
  - 体验：江洋大盗被猎人擒获押赴刑场，斩首前夕同党劫狱爆发激烈巷战；
  - 负控制：缺乏合法证据链与物证支撑，法官断言禁止直接判决斩首极刑。

---
### EXV18-8 · 远古遗迹机关密码与环境自毁陷阱引擎
- **落盘核心**：`engines/ruin-mechanism.js`
- **机制原理**：
  - 遗迹/地宫/宝库机关网络：压力踏板、密码轮盘、自毁水银/注沙/毒气闸门；
  - 结合角色盗贼敏捷、感知拆除工具或古文字学识进行解密；
  - 破解失误触发连锁自毁与坍塌，必须在限定回合内逃生。
- **调度写口**：
  - `ruinMechanism.triggerMechanism(spec)`
  - `actionDesk.act('ruin.triggerMechanism', spec)`
- **产品体验与负控制**：
  - 体验：探险者误触石雕密码，断龙石封路，密室开始灌入流沙倒计时生死逃脱；
  - 负控制：已使用真传钥匙成功解除引信的机关，断言绝不误触自爆陷阱。

---
### EXV18-9 · V18 史诗宏观战局与生死交锋沙盘大盘
- **落盘核心**：`ui/panel.js` (V18 扩展)
- **机制原理**：
  - 延续玩家第一视觉极简原则：深度战场战报与创伤表单默认收折进 `<details class="wa-details">`；
  - 聚合呈现：前线战局兵力天平、要害创伤分布、围城断粮倒计时、公审通缉榜单。
- **调度写口**：
  - `panel.renderV18EpicClashBoard()`
- **产品体验与负控制**：
  - 体验：玩家在首屏一览天下战事与通缉风云，点击展开专家层查验要害伤情与机关密码；
  - 负控制：折叠层内部所有控件均具备标准无障碍命名且 mini-DOM 穿透寻址 100% 保持全绿。