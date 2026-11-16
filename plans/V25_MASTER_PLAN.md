# WorldAxis V25 主计划：柏宝书 + 数据库 缝入批（11 项，v2.417.0）

> **上游来源**：柏宝书 baibai-git/ST-BaiBai-Book（已克隆 /home/user/memory-plugin-research/baibai，同步至 0a3a1cd / v1.3.5）；
> 数据库 AlbusKen/shujuku（已克隆 /home/user/memory-plugin-research/shujuku，同步至 c45d50e / spv9.2.5.1）。
> 用户指令：两边已全部更新，把可缝入的机制与内容缝进 WorldAxis，**一个版本做完 11 项**。

## R0 审计结论（先核后缝，严禁重复造轮子）

四点弱命中全部排除（同名异义）：`lifeDetail`（lonsha-reader 记忆桥字段）/ 幂等闸（rule-pack 档位切换 v2.264.0）/
推演提示词（plan.chainBlock 渲染面）/ 来源身份（timeline v2.65.0 已有）。已有覆盖不再立项：
noesis（裁决口，非档案账）/ intel（情报置信传播，非对主角了解清单）/ fondness（单轴数值）/ foreshadow+longline（伏笔+承诺）/
summarizer（双层摘要，无易漏预标注）/ digest（每轮推演叙事，非整轮执行链）/ bridge.flushDirtySnapshots（无节流+尾随补存）/
floor-snapshot（无批量回放续放）/ commit.opKey（链级，非推进幂等闸）/ store.people.*.knowledge（backstage 泛化知识，无主角专用防全知档）。

## 拓展线 EXV25-1～5（柏宝书）

| 项 | 引擎 | 治什么 | 缝什么 |
|---|---|---|---|
| EXV25-1 | `player-knowledge.js` | per-NPC「对主角的了解清单」缺失：世界书常驻导致角色对主角全知 | 档案账 add/correct/forget + knows() 判定「没记=不知道」；被骗记被骗后的认知，揭穿才改写 |
| EXV25-2 | `affection-dual-axis.js` | 好感只有 fondness 单轴数值，无「内心 vs 外在」分轨 | 双轴五档（内心好感/外在态度）+「未知≠中性」+ 证据门槛（嘴硬/客套≠变心）|
| EXV25-3 | `life-profile.js` | 生活小档案无 per 人物归属（subject） | record 按人分账，同一句偏好不同人各记各的，不跨人合并 |
| EXV25-4 | `suspense-ledger.js` | 约定/悬念无统一核销簿：办完的事 AI 反复提 | open/close(须 eventId)/overdue 提醒不消账 |
| EXV25-5 | `source-hints.js` | 摘要/生成材料易漏「限制/比较/读数/状态变化」原句 | 线索预标注 excerpts 副本（不截断不概括），供 summarizer/backstage 消费 |

## 优化线 OPV25-1～6（数据库）

| 项 | 引擎 | 治什么 | 缝什么 |
|---|---|---|---|
| OPV25-1 | `advance-idempotence.js` | 剧情推进无幂等闸：同楼层重放/换滑动重复触发 | opKey(楼层+滑动+结算签名) 一次都不重写 |
| OPV25-2 | `takeover-yield.js` | 引擎接管时宿主无让路提示，渲染被阻塞 | yield 显式可见提示 + 非阻塞让路回执 |
| OPV25-3 | `sim-rehearsal.js` | 整轮推演无执行链：无占位符替换、无逐步留痕、不可中止 | plan/step(占位符替换)/commit/abort 四口 |
| OPV25-4 | `history-batch-read.js` | 历史回放逐层冷读：无帧楼层也逐层回放 | 最新快照续放 + 无帧区间直接跳过 |
| OPV25-5 | `save-throttle.js` | 运行期全量存盘无节流：高频小写全量刷盘 | 窗口合并 + 尾随补存（trailing flush）|
| OPV25-6 | `history-provenance.js` | 历史读数无来源身份：读到的是哪层楼/哪次提交不可考 | 每次读出带 provenance(楼层/提交/哈希) |

## 场景 69 专锁
`tests/scenario-v69-v25-stitch.js`：11 引擎合法因果贯通 + ≥3 条真源码负控制 + action-desk 路由全覆盖。

## 实施铁律
1. 每项真缺口，先专锁后实现（至少正样本+一条真源码破坏）；
2. 写口统一收拢 ActionDesk；新持久键在 evict 登记站点容量；
3. 无源不入账、无写不落盘、无验不上线；
4. 版本四件套同批升 v2.417.0，export-contract 重冻结，收口提交后回填 BUILD_ID。
