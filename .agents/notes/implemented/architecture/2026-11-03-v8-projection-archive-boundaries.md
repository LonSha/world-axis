# Agent Note: V8 结构汇流、排期兑现与玩家归档的边界

Status: implemented

## Problem
V8 的断点不在「五台引擎完全没有注入」：既有 render 分支已经读取它们的短块。缺的是更深的承诺、当前计划卡点、已持有情报等材料。与此同时事件只有排期/认领/回报，没有自动兑现消费方；自传与各看板没有共同带离入口。把这三件事合成一个会写世界的聚合器会制造第二真源。

## Decision
`injectCollector` 是默认关闭的只读汇流层，直接走 owner 公共读口；排名先看预算 rank，再看场景相关性，新鲜度只在同一 owner 内比较。每 owner 限条数，总字符有硬上限。plan 只给当前拟稿及 blockedBy，不给未来 rest；intel 只给 held，不给在途；secret 承诺不进正文。关系材料明确是当前登记，不冒充新发生的关系变动。

`populate.seed()` 自动读取真实 buildBlock 前后非空面，必须增长且不倒退、无构建异常才显示绿色回执。写入执行和产出复核分开：复核失败不能声称已回滚写批。面板把两面同时展示。

事件兑现默认关闭，启用 `events.autoFulfill` 才由 before 链调用。排期标题是唯一被自动兑现的内容；不从任意 payload 猜结果，不替 conditional 猜条件成立。archiveScheduled 是 backstage 的窄归档写口，由 events 的完成事务调用；归档和回执同生共死，不调用包含 digest 副作用的 applyResult。失败后只恢复本桥持有的 claimed 行，外部 executor 归属不被抢占。

`playerArchive` 导出九路 owner 投影，自传新局包把「结构种子」和「来源自传附件」分开。目标局仍走 worldSeed 的导入、预览票据、显式确认；来源历史绝不初始化为目标历史。周期作品从 evolution.roundOf 读取轮号，按聊天保存在本机 localStorage（默认关闭，最多24份、总字符上限524288），不是第二套可回写世界状态。

带离包是作者侧私密包，可能包含秘密、情报持有人与注入内容；UI 和格式显式标注，不假装是可公开的玩家安全摘要。

## Alternatives considered
- **继续只读五台 buildBlock**：接线最少，也能拿到摘要；但看不到结构化细节、当前卡点，不能解决本次缺口。因此保留旧源，另加默认关闭的汇流源，而不是替换旧行为。
- **用 plan.chainBlock 剥文本**：能复用现有格式，但该口专供推演，含未来步骤；采用结构化 chain 的当前投影，避免穿透正文边界。
- **调用 backstage.applyResult 来转写排期**：能复用现成归档循环，但该函数还触发 digest、清人格计量，放到完成事务里会引入非归档副作用。窄写口复用现有 chronicle 容器及 evict 站点。
- **自传正文灌入新局 chronicle**：最像「续上上一局」，却把重开格局和延续进度混为一谈；因此只作为来源附件交付，不改变 worldSeed 的保留层级。
- **作品写入世界 store**：易跨设备随存档走，但每个周期会使整个世界体积增大，且投影被误当真源的风险更大；采用有界本地缓存加显式 JSON 带离，承认不跨设备自动同步的代价。

## Consequences
汇流、兑现、归档职责分离，默认关闭不凭空改变旧局。事件桥只证明「已登记标题的兑现」，不证明外部动作真实成功；有外部执行器的排期应继续走认领/回报而非自动桥。到期钟仍是事件钟，不和承诺时窗换算。

周期作品保存在本机，清站点数据会丢失；用户必须导出备份。新局包的保存会明确写来源种子库，保存之后目标操作不碰来源字节。投影 owner 返回禁用或空数据时按原读数保留，不编内容。

## Verification
独立专项（不执行主回归）已实测：collector 18/0、seed-volume 13/0、event-bridge 18/0、player-archive 21/0。覆盖真源码破坏、同款行为判据、归档异常回滚及重试、重复回执拒收、未到期和未见证条件隔离、源局→目标预览→确认→源局字节不变、周期去重与容量。新专项装载器使用独立 VM，不再替换主进程 global.WorldAxis/localStorage。

这些是无头 owner/注入 mock 证据，不是实机宿主验收。UI 实机、全量台账跟版及最终回归仍须单独完成。

## Related decisions audit
- [事件钟与承诺台账](2026-11-01-exv77-event-calendar.md)：部分重叠，保留异钟、秘密作者面与正文面边界。
- [一键播种](2026-11-01-exv79-one-click-populate.md)：部分重叠，扩展自动复核但不改变写 owner 与容量纪律。
- [世界自传](2026-11-01-exv78-world-autobiography.md)：部分重叠，复用分章与隐藏过滤；空自传导出缺 appendix 的异常同步修复，不改变分章决定。
- proposed 中 player-workflows、tp-tx-plans、o-e-plans、play-depth-emergence：是更广的历史提案，本篇只覆盖上述已实现边界，不宣称完全吸收或全部兑现，不移动或改写其决定。

## Panel activity and shared budget
诊断的 L2p 名单取自 driverLedger，而不是固定 50 台；writeDesk 的动态调用只有面板真实消费 call 时才贡献可达性。roundDrivers 的显式表与真实 computed call 共同证明驱动边，表本身不能洗绿。healthPreflight 支持按 keys 采样，避免原来的100行截断漏掉尾部；没有 enabled 设置的 builder 单独实调，不把开关清册缺席误判成异常。
写口台仅把 ok 且非 disabled 的回执算作 written。专属面板写口尚无统一成功回执，所以诊断明确 receiptScope=write-desk-only；不能把静态可达性当作点击已验。控件活动由面板根节点 capture click/change，重绘不重绑业务回调；只统计当前运行期，不写世界、不跨设备持久化。零使用不是不可达，条件和动态输出仍保留层级。
注入源共用全局 token 池，没有虚构每源独立额度。volumeView 每源记录 poolRemain，显式提供的 source limit 才给 cap；render 传入真正计划预算。共享超额（含 pinned 保底超额）返回 budget-exceeded 和 used/cap/excess 见证，但体积账不另行裁剪、不推翻既有 pinned 策略。
事件桥恢复队列和新认领共享 maxClaims，失败恢复优先；外部持有排期仍保守阻塞整桥，不抢外部执行器的租约。本版面板补齐 autoFulfill、作品周期与保留份数控制。
