# WorldAxis 拒收码手册（自动生成：`node tools/gen-error-codes.js`）

> 台账 version：`2.115.0`。**不要手改本文件** —— 生成源是 `reject-v2780.js`（见证/死表）、
> `reject-code-ledger.json`（基线）与产品源码扫描面，手改的内容下一次生成即被覆盖。

共 **399** 个内联拒收码：见证 161 / 死表 5 / 基线 233

三档的含义：**见证**=用产品真 API 把它跑出来过（行为改动会让见证失败，红灯）；
**死表**=已证结构不可达，且钉住「为何不可达」的锚点（锚点消失即红灯）；
**基线**=存量未分类（新增未分类码即红灯）。

## 见证（可执行）（161）

| 码 | 出现之处 | 说明 |
| --- | --- | --- |
| `adopt-throw` | engines/canon.js | canon.adopt：落盘事务抛异常 ⇒ 如实归因，且**不留半份大纲**（v2.99.0） |
| `alias-cycle` | actors/registry.js | registry.bindAlias：自指登记（旧名就是现名 ⇒ 这条边没有意义，v2.97.0 O9） |
| `already-linked` | engines/phone-bridge.js | phoneBridge.linkChain：已接过别的链**不覆盖**（静默改写会让「这条链的因」事后被换掉而没人知道，v2.97.0 X5） |
| `already-recording` | core/rand.js | 录制中拒绝再开一卷（防一卷覆盖一卷、前一卷静默丢失） |
| `bad-action` | core/audit-log.js | auditLog.record：动作名为空 ⇒ 如实拒收且**不进环**（不静默记一条无名事实，v2.111.0 plan-2 #67） |
| `bad-actor` | engines/collab.js | collab.claim/release/noteConflict：actor 为空 ⇒ bad-actor（缺字段不猜：不按次序编一个人名，v2.112.0 plan-2 #37） |
| `bad-anchor` | engines/chrono.js | chrono.record：锚点名为空 ⇒ 如实拒收（不记一条没有锚点的变更，v2.112.0 plan-2 #31） |
| `bad-args` | engines/causal.js | defer 传 0 或非数 |
| `bad-base` | engines/chrono.js | chrono.record：`base` 给了但归一后为空（纯空白）⇒ bad-base（**不**当成「这是根」——「他说了有个上游」与「他说没有上游」是两件事，v2.112.0） |
| `bad-char` | engines/kaleidoscope.js | formula 写不认识的单字符 |
| `bad-conflict` | engines/collab.js | collab.resolve：冲突 id 归一后为空 ⇒ bad-conflict（与 bad-session 分开：冲突与会话是两个对象，把前者报成后者会让排查查错表，v2.112.0） |
| `bad-coord` | engines/canon.js, ui/panel.js | canon.locate：坐标语法不对（`zz` / `A` / 空串一律照实拒收——人写的坐标往往不是坐标，v2.99.0） |
| `bad-delta` | engines/beast-bond.js, engines/era-cycle.js, engines/fondness.js, engines/gauge.js | gauge.step 传 NaN / ±Infinity（本版从 missing-fields 里拆出的独立根因） |
| `bad-factor` | engines/perf-trace.js | perfTrace.setThresholds：factor <= 1 或非有限数 ⇒ 拒收（劣化与改进不可分辨，v2.109.0） |
| `bad-fn` | engines/causal.js | causal.record / replayWith 收到非函数时如实拒收 |
| `bad-format` | core/audit-log.js, core/rand.js, engines/checkpoints.js, engines/org.js | 信封格式号非有限值 / 不是 JSON / 没有 worldaxisCheckpoint 标记 |
| `bad-id` | engines/chrono.js, engines/kaleidoscope.js | setDerive/setRule 传含空格的 id |
| `bad-kind` | engines/events.js, engines/karma.js, engines/life.js, engines/shadow.js, engines/tolerance.js, engines/weather.js, engines/world.js | addCommitment 传非法承诺类型 |
| `bad-layer-or-key` | engines/perf-trace.js | perfTrace.mark：层不在封闭集合（或键为空）⇒ 如实拒收、不计数（v2.102.0） |
| `bad-motive` | engines/rumor.js | rumor.relay 传四值以外的动机 ⇒ 拒收（不静默当 honest，v2.96.0 X3） |
| `bad-number` | engines/kaleidoscope.js | formula 写 1.2.3 |
| `bad-op` | engines/collab.js, engines/kaleidoscope.js | setDerive 传未知算子 |
| `bad-outline` | engines/canon.js, ui/panel.js | canon.adopt：收到不是大纲的东西（面板从没试算过就点采纳 / 外部传了空值，v2.99.0） |
| `bad-path` | engines/kaleidoscope.js | setDerive 传空白 path（resolvePath 首筛，内部可达） |
| `bad-priority` | engines/events.js | events.schedule 传越界优先级 99（合法域 0..9） |
| `bad-range` | engines/kaleidoscope.js | range 缺 min/max 或 max<=min |
| `bad-ref` | engines/kaleidoscope.js | formula 写 $+1（$ 后无名字） |
| `bad-resource` | engines/org.js | grant/transfer 空资源名或非正数量 |
| `bad-scope` | engines/checkpoints.js | checkpoints.resolveScope 传不在白名单里的范围 |
| `bad-seed` | core/rand.js | 非有限种子如实拒收复核（NaN/Infinity 不得被当成某个种子） |
| `bad-segments` | engines/kaleidoscope.js | map 缺 segments / segments 里 max 非数 |
| `bad-session` | engines/collab.js | collab.open/close/claim：会话标识归一后为空 ⇒ bad-session（不建一个无名会话，v2.112.0 plan-2 #36） |
| `bad-shape` | actors/registry.js | setProfileSafe 传非法形态节 |
| `bad-slot` | actors/registry.js | setPersonaDice 指定不存在的槽位 |
| `bad-strategy` | engines/collab.js | collab.resolve：策略不在封闭集合里 ⇒ bad-strategy 并附可选策略（**不自动裁决**：分歧怎么判必须由人显式说出，v2.112.0 plan-2 #40） |
| `bad-tape` | core/rand.js | replay 收到不是磁带的入参时如实拒收（不按空卷假装走一遍） |
| `bad-time` | engines/events.js, engines/life.js, engines/scene-slice.js, engines/world.js | addSchedule end<=start |
| `bad-trigger` | engines/events.js | events.schedule 排期参数不成形（repeat 缺正 intervalMs / delayed 缺 at\|inMs / conditional 缺 condition） |
| `bad-weight` | engines/rivalry.js | rivalry.declare 传非数 / 非有限 weight（本版从静默降级改为如实拒收） |
| `bad-word` | engines/kaleidoscope.js | formula 写裸单词 |
| `blank` | core/input-guard.js | 输入边界：纯空白串不是有效文本（v2.84.0 新增） |
| `build-throw` | engines/canon.js | canon.buildOutline：切分过程内部异常 ⇒ 与「你给的东西不对」分开报（引擎坏了是另一件事，v2.99.0） |
| `chains-full` | engines/rumor.js | rumor.startChain 超出 maxChains ⇒ 拒收（满员拒收不挤出，v2.96.0 X3） |
| `checksum-mismatch` | engines/checkpoints.js | 信封校验和与正文对不上（搬运途中被改写） |
| `claimed-by-other` | engines/collab.js | collab.claim：同一 actor 已被**另一个**会话占用 ⇒ claimed-by-other 并带出持有者（不夺取、不做超时夺锁 —— 让调用方自己决定，v2.112.0 plan-2 #36） |
| `clear-throw` | engines/canon.js | canon.clearOutline：清空事务抛异常 ⇒ 如实归因（v2.99.0） |
| `condition-unmet` | engines/events.js | events.claim 时不传 metConditions（世界条件未足 ⇒ 状态零变化） |
| `cycle` | engines/kaleidoscope.js | 两个派生量互相引用 |
| `div-zero` | engines/kaleidoscope.js | formula 除以 0 |
| `duplicate` | engines/collab.js, engines/events.js | events.schedule 同 id 且仍在活动态（不静默覆盖既有排期） |
| `expr-too-long` | engines/kaleidoscope.js | formula 表达式超过长度闸 |
| `fault-handled` | core/fault-context.js | faultContext.wrap：被包装调用抛出且未声明 rethrow ⇒ 如实吞错并归因（v2.110.0 plan-1 #21） |
| `flush-failed` | core/audit-log.js | auditLog.flush：setItem 抛错 ⇒ 吞成 flush-failed（落盘失败不许把调用方搞挂，与 record() 的「从不抛」同一条纪律，v2.112.0） |
| `guarded-key` | engines/checkpoints.js | checkpoints 显式点名守卫键（schemaVersion）存快照 |
| `hops-full` | engines/rumor.js | rumor.relay 超出 maxHops ⇒ 拒收（中间跳不许被挤掉，v2.96.0 X3） |
| `in-replay` | core/rand.js | 回放中拒绝开新卷（v2.89.0 O2：取证期间不得改被取证对象） |
| `incomplete-dice` | actors/registry.js | setPersonaDice 骰面不完整 |
| `insufficient` | engines/org.js | transfer 资源不足（须两个不同持有方） |
| `invalid-input` | core/schema.js | schema.validate：字段缺失或类型不符 ⇒ invalid-input + errors 数组（v2.110.0 plan-1 #22） |
| `lib-unreadable` | engines/checkpoints.js | 快照库读不出时 save/read 一律拒收（绝不覆盖写） |
| `link-off` | engines/hazard.js, engines/phone-bridge.js | hazard.roll 显式给了空地点 ⇒ 天气面照实报 link-off（不给 at 时回执里连 weather 字段都没有，v2.96.0 X6） |
| `missing` | core/input-guard.js, core/store.js, engines/affect.js, engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/checkpoints.js, engines/enigma.js, engines/era-cycle.js, engines/events.js, engines/fondness.js, engines/gauge.js, engines/hazard.js, engines/kaleidoscope.js, engines/karma.js, engines/ladder.js, engines/marginal.js, engines/masks.js, engines/org.js, engines/parallel-events.js, engines/quota.js, engines/rivalry.js, engines/rumor.js, engines/scene-slice.js, engines/survival.js, engines/temperament.js, engines/temporal-lock.js, engines/tolerance.js, engines/warrant.js, engines/weather.js | path 指向不存在的键 |
| `missing-chain` | engines/causal.js | causal 查无此链 |
| `missing-effect` | engines/intel.js | explain 查无此后果 |
| `missing-fields` | core/store.js, engines/affect.js, engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/causal.js, engines/checkpoints.js, engines/enigma.js, engines/era-cycle.js, engines/events.js, engines/fondness.js, engines/gauge.js, engines/hazard.js, engines/intel.js, engines/karma.js, engines/ladder.js, engines/life.js, engines/marginal.js, engines/masks.js, engines/parallel-events.js, engines/phone-bridge.js, engines/quota.js, engines/rivalry.js, engines/rumor.js, engines/scene-slice.js, engines/shadow.js, engines/survival.js, engines/temperament.js, engines/temporal-lock.js, engines/tolerance.js, engines/warrant.js, engines/weather.js, engines/world.js, actors/registry.js | causal 必填字段缺失 |
| `missing-holder` | engines/org.js | grant 持有方不存在 |
| `missing-keys` | engines/checkpoints.js | checkpoints 取 module/scene 范围却不给键 |
| `missing-name` | core/schema.js, engines/world.js, actors/registry.js, ui/panel.js | registry 各入口空名 |
| `missing-operator` | engines/kaleidoscope.js | when 写 $n1（比较式缺比较符） |
| `missing-perm` | core/permissions.js | permissions.grantDirect：权限位为空 ⇒ 如实拒收（不静默授一个空位，v2.110.0） |
| `missing-person` | engines/life.js | life 各入口空人名 |
| `missing-role` | core/permissions.js | permissions.defineRole：角色名为空 ⇒ 不注册并如实报（不静默建一个无名角色，v2.110.0） |
| `missing-route` | engines/intel.js | addIntel 只给了路程一端 |
| `missing-text` | engines/life.js, engines/quota.js | addGoal 空目标文本 |
| `missing-user` | core/permissions.js | permissions：用户名为空 ⇒ 如实报 missing-user（与 unknown-user 分开：前者是调用方漏参，后者是人不在册，v2.110.0 plan-2 #39/#70） |
| `module-absent` | engines/perf-trace.js | perfTrace.runFace：面模块缺席 ⇒ 该面 absent（不是「跑了 0ms」也不编样本，v2.102.0） |
| `name-taken` | actors/registry.js | registry.bindAlias：一个旧名只能有一个主人（两个主人 ⇒ 同一行解析出两种身份，v2.97.0 O9） |
| `need-confirm` | engines/chrono.js, engines/collab.js | chrono.applyUndo：缺 `{confirm:true}` ⇒ need-confirm（「试算」与「真做」必须分开说：默认走 undo 的 dryRun，绝不默认落地，v2.112.0 plan-2 #33） |
| `no-base` | engines/chrono.js | chrono.record：`base` 指向不存在的记录 ⇒ no-base（不静默降级成根节点：降级会把断链伪装成合法分层，v2.112.0） |
| `no-clock` | engines/weather.js | weather.season 在无世界钟时 |
| `no-conflict` | engines/collab.js | collab.resolve：冲突 id 不在册 ⇒ no-conflict（不假称裁决了一条不存在的分歧，v2.112.0 plan-2 #40） |
| `no-entry` | engines/chrono.js | chrono.undo：记录 id 不在图里 ⇒ no-entry（读面同样要如实归因，不返回空计划，v2.112.0） |
| `no-history` | core/audit-log.js, engines/canon.js | canon.position：大纲已采纳但世界侧还没历史 ⇒ 照实说「还没得对」（不编读数，v2.100.0） |
| `no-journey` | engines/world.js | where() 某人无任何行程记录 |
| `no-migration` | engines/checkpoints.js | 信封版本更旧但没有登记对应迁移步骤（不猜） |
| `no-ops` | engines/phone-bridge.js | phoneBridge.linkChain：因果容器在但台账面不存在（旧存档 / 外部导入没带这一层，v2.97.0 X5） |
| `no-outline` | engines/canon.js | canon.locate：还没采纳任何大纲就按坐标定位 ⇒ 照实说「没有基准」（不编一份出来，v2.99.0） |
| `no-rotation` | render/inject.js | 未注入过时照实拒答（不编一份空解释当答案，v2.90.0 O3） |
| `no-sections` | actors/registry.js | setProfileSafe 传空节（无任何变更） |
| `no-seed` | core/rand.js | 无种子的磁带如实拒收复核（不假装复核过） |
| `no-session` | engines/collab.js | collab.close/claim：会话 id 不在册（或已关闭）⇒ no-session（**不假称成功**：关闭一个不存在的会话若回 ok:true，调用方会以为自己关掉了什么，v2.112.0） |
| `no-signal` | engines/canon.js | canon.position：有历史但一行都没撞上幕目题名 ⇒ 照实说没信号而**不给「最接近」的坐标**（v2.100.0） |
| `no-tape` | core/rand.js | tapeVol 在本侧无卷（无从调用的在卷、也没有留存卷）时如实拒答（v2.98.0 P2） |
| `non-finite` | core/input-guard.js | 输入边界：NaN/±Infinity 不得被升格成字面量（v2.84.0 新增） |
| `not-a-function` | core/fault-context.js, core/sandbox.js | faultContext.wrap：第二参数不是函数 ⇒ 如实拒收（不是「没抛所以成功」，v2.110.0） |
| `not-a-number` | engines/kaleidoscope.js | 非数值参与算术 / map 输入非数 |
| `not-a-string` | core/input-guard.js | 输入边界：对象/数组/函数不得被隐式字符串化（v2.84.0 新增） |
| `not-active` | engines/events.js | events.cancel/replace 打在终态行上（已结束的排期不可再动） |
| `not-bound` | actors/registry.js | registry.bindAlias：规范名不在册（给不存在的人登记历史名 = 凭空造一个身份，v2.97.0 O9） |
| `not-claimed` | engines/events.js | events.complete 对未认领的行回报（没认领不许宣称做完） |
| `not-due` | engines/checkpoints.js | 自动快照开了但这一轮还没轮到（与 disabled 各自成词） |
| `not-object` | core/evict.js, core/settings-bus.js, actors/registry.js, render/purifier.js | setProfileSafe/setPersonaDice 传非对象 |
| `not-recording` | core/rand.js | 无在卷时收卷被如实拒收（不伪造一卷空磁带） |
| `not-replaying` | core/rand.js | 未在回放时退出被如实拒收（不谎报「刚结束了一次回放」） |
| `one-sided` | engines/collab.js | collab.noteConflict：只有一侧改动 ⇒ one-sided（**单边改动不是冲突**：把它记成冲突会让复盘时到处是「谁跟谁冲突了」的假案，v2.112.0 plan-2 #38） |
| `ops-full` | engines/phone-bridge.js | phoneBridge.noteAction：台账满 ⇒ 拒收而非静默挤掉（挤掉一笔 = 让「这条链的因」事后消失，v2.97.0 X5） |
| `orphaned-epoch` | core/store.js | store.batch：批横跨聊天纪元（批进行中 init/切聊天）⇒ 该批退出不落盘、且其候选从内存一并丢弃（声明的「已丢弃」必须同时对存储与内存成立，v2.113.0 A1） |
| `out-of-range` | engines/canon.js | canon.locate：坐标语法对但号越界 ⇒ 照实说「不成立」而**不夹到边界**（幕号是标出来的，v2.99.0） |
| `overflow` | engines/kaleidoscope.js | formula 结果溢出（本版修复后新可达） |
| `parent-cycle` | engines/world.js | 补全归属会让父子互相归属 ⇒ 拒收（v2.85.0 B2） |
| `parent-locked` | engines/world.js | 已有归属不得被冲突改写（v2.85.0 B2：无→有是补全、x→y 才是改写） |
| `permission-denied` | core/permissions.js, core/store.js | permissions.has/check：人在册但没有该权限位 ⇒ permission-denied（与 unknown-user 分开，v2.111.0 plan-2 #67） |
| `plugin-blocked` | core/plugin.js | plugin.register 的 beforeSave 钩子返回 ok:false ⇒ save 前拦下（plugin-blocked）；「钩子说不行」与「钩子没说话」必须分开（v2.114.0） |
| `pre-violation` | render/inject.js, render/purifier.js, render/theater.js | 渲染层防御式边界：公开入口的参数类型错 ⇒ 明确归因（与「合法但空」的 missing-find/no-id/empty-text 分开，v2.108.0） |
| `produce-failed` | engines/perf-trace.js | perfTrace.ensure：produce 抛错 ⇒ ok:false 且**不写缓存**（旧值不许连坐，v2.102.0） |
| `rand-absent` | engines/causal.js | 随机源缺席时如实拒收（不静默降级成「录了一卷空的」） |
| `record-failed` | core/audit-log.js | auditLog.record：连「取属性即抛」的敌意 opts 都吞成归因 ⇒ 从不抛、不改产品行为（v2.111.0 plan-2 #67） |
| `recording` | core/rand.js | 录制中拒绝进入回放（否则这一次推进既录又放、两边都不是） |
| `restore-failed` | core/audit-log.js | auditLog.restore：getItem 抛错 ⇒ 吞成 restore-failed（与 bad-format 分开：前者是「没读到」，后者是「读到了但不认识」，v2.112.0） |
| `reuse` | engines/perf-trace.js | perfTrace.ensure：命中路径的正常归因（与 stale/forced 并列答「为什么是它」，v2.102.0） |
| `road-crowded` | engines/world.js | 路段容量满 ⇒ 拒收且不落盘（v2.85.0 B2：走得通 ≠ 现在走得动） |
| `round-not-recorded` | render/inject.js | 轮次坐标不符时照实拒答（不拿上一轮的当这一轮，v2.90.0 O3） |
| `sandbox-throw` | core/sandbox.js | sandbox.run：脚本自己抛错 ⇒ 吞成 sandbox-throw（沙箱口不许把调用方搞挂；与「Access denied」分列——前者是脚本坏了，后者是边界挡下了，v2.114.0） |
| `sandbox-timeout` | core/sandbox.js | sandbox.run：同步体跑过 timeoutMs ⇒ sandbox-timeout（超时是读数不是崩：仍把已完成的返回值带出供调用方判，v2.114.0） |
| `self-cause` | engines/intel.js | addLink cause === effect |
| `self-parent` | engines/world.js | 地点不得以自己为父级（v2.85.0 B2） |
| `storage-unavailable` | core/audit-log.js | auditLog.flush/restore：宿主没有 localStorage ⇒ 如实报 storage-unavailable（**不**返回 ok:true/written:0 —— 那会让「落盘成功」与「根本没落」同形，v2.112.0） |
| `suppressed-full` | engines/rumor.js | rumor.conceal 超出 maxSuppressed ⇒ 拒收（隐瞒与跳分列计数，v2.96.0 X3） |
| `tape-open` | core/rand.js | 未收卷的磁带拒绝回放（它还在录，值不完整） |
| `tape-without-values` | core/rand.js | 只记位置的磁带拒绝回放（无处取值就别假装能重放） |
| `threw` | engines/kaleidoscope.js | setDerive 内部抛出 |
| `time-conflict` | engines/life.js | addSchedule 与已有活动重叠 |
| `too-deep` | engines/chrono.js, actors/registry.js | registry.bindAlias：链深超过 8 跳当场拒收（往表里放一条永远解析不出来的登记 = 在账上打个死结，v2.97.0 O9） |
| `too-many` | engines/kaleidoscope.js | 派生量 / 规则超过上限 |
| `too-new` | engines/checkpoints.js | 信封格式号高于本引擎支持的 FORMAT |
| `trailing-token` | engines/kaleidoscope.js | formula 尾部多余 |
| `unbalanced-paren` | engines/kaleidoscope.js | formula 括号不配对 |
| `unexpected-end` | engines/kaleidoscope.js | formula 尾部缺操作数 |
| `unexpected-token` | engines/kaleidoscope.js | formula 位置不对的符号 |
| `unexplained` | engines/intel.js | explain 后果存在但无可用原因 |
| `unknown-action` | engines/causal.js | 干预预览的未知动作被显式拒收（v2.87.0 B6，不静默当作 advance） |
| `unknown-cause` | engines/causal.js, engines/intel.js | addLink 传不存在的因 |
| `unknown-chain` | engines/phone-bridge.js | phoneBridge.linkChain：链必须**已存在**（接一条不存在的链 = 用桥给世界造一条因果，v2.97.0 X5） |
| `unknown-class` | engines/perf-trace.js | perfTrace.bench：未知档位 ⇒ 拒收并报出可选档（不默认跑一档，v2.102.0） |
| `unknown-derive` | engines/kaleidoscope.js | formula 引用不存在的派生量 |
| `unknown-fact` | engines/rumor.js | rumor.startChain 点名一条没登记的事实 ⇒ 拒收（不凭空造一条链，v2.96.0 X3） |
| `unknown-format` | engines/perf-trace.js | perfTrace.flamegraph：未知形态 ⇒ 拒收并报出可选形态（不回默认形态，v2.109.0） |
| `unknown-hook` | core/plugin.js | plugin.fire：钩子名不在四钩子封闭集合里（init/beforeSave/afterLoad/onRender）⇒ unknown-hook，不把拼错的钩子名当成「没人监听」（v2.114.0） |
| `unknown-keys` | engines/checkpoints.js | checkpoints 点名了骨架里没有的顶层键 |
| `unknown-name` | actors/registry.js | registry.aliasOf：对完全不在册的名字**不编**一个规范名（v2.97.0 O9） |
| `unknown-op` | engines/phone-bridge.js | phoneBridge.linkChain：台账里没有这笔操作（认不出是谁 ⇒ 不许凭空接上，v2.97.0 X5） |
| `unknown-parent` | engines/world.js | 登记的父级必须已登记（v2.85.0 B2：不猜「大概同城」） |
| `unknown-policy` | engines/perf-trace.js | perfTrace.setCachePolicy：未知淘汰策略 ⇒ 拒收并报出可选策略（不静默按 fifo，v2.109.0） |
| `unknown-role` | core/permissions.js | permissions.grant：角色名不在册 ⇒ unknown-role 并附已知名单（**不静默接受**，v2.110.0） |
| `unknown-schema` | core/schema.js | schema.validateNamed：名字没注册过 ⇒ unknown-schema（**不**按空 spec 静默放过，v2.110.0） |
| `unknown-span` | engines/perf-trace.js | perfTrace.noteSpan：未知分列名 ⇒ 拒收并报出可选项（不静默丢桶，v2.102.0） |
| `unknown-subject` | engines/intel.js | addIntel 传未知 about 主体 |
| `unknown-theme` | engines/theme.js | 未知题材拒收且不改设置（v2.87.0 B7：不静默当空集） |
| `unknown-user` | core/permissions.js | permissions.has：用户未注册 ⇒ unknown-user（「谁都没说不行」不等于「说了行」，v2.110.0） |
| `unreciprocated` | engines/life.js | 单向宣布的合作不得被当作已建立的协作（v2.85.0 B1） |
| `world-missing` | engines/intel.js, engines/weather.js | travelOf 在 world 未装载时 |

## 死表（已证不可达）（5）

| 码 | 出现之处 | 说明 |
| --- | --- | --- |
| `backup-corrupt` | core/settings-bus.js | v2.83.0（B6）cfgRollback 的备份解析出口，在当前设计下**结构上不可达**：cfgRollback 只在「写盘阶段中途失败」时被调用，而进入写盘阶段的前提是**导入前备份已成功写入**（备份失败会在写盘前以 backup-failed 拒收整次导入，见 settings-bus 的写盘前置条件）。而备份成功必然把同一个备份键覆写成合法 JSON ⇒ cfgRollback 读到的必是合法 JSON。故要走这条分支，得先有一个「存在但不是 JSON」的备份键，同时备份写入又失败——与前置条件互斥。不删：第三方脚本或外部工具若直接调用回滚入口（或未来备份环引入多源写入），它是第一道防线；届时本门禁会以 deadLeak 提醒「该码可能复活」。 |
| `bad-draft` | actors/registry.js | registry.ensurePerson（v2.86.0 A3，people 条目的唯一写者）的入参守卫，在现有调用面上结构不可达：它的调用点（life.person / intel.personRow / backstage 两处 / registry.setProfileSafe）全部位于 store.transact(function (draft) {...}) 回调内，而 transact 保证传入骨架草稿对象。不删：唯一写者是对外导出，越界调用时它是第一道防线；届时本门禁会以 deadLeak 提醒它可能复活。 |
| `bad-operator` | engines/kaleidoscope.js | parseCmp 的筛选形式是：取 tk，要求 tk.t === "op"，p++，v := tk.v；而 tokenize 产 op 的分支只输出 >=/<=/==/!=/>/<，该集合恰是下面 if/else 链的全部分支，故 else 永不取。穷举验证：6174 个长度≤3 的词法组合全跑一遍，该码零见证。不删：若未来新增比较符，它是第一道防线（本面门禁会在那时通过 deadLeak 提醒「该码可能复活」）。 |
| `end-failed` | engines/causal.js | causal.record（v2.89.0 O2）的收卷失败出口，在现有设计下**结构不可达**：进入该分支的前提是 beginTape 成功，而 beginTape 成功必然把磁带置于 open=true；endTape 的拒收条件恰是“磁带不存在或已收卷”，两者互斥。唯一能造出“begin 成功但 end 拒绝”的路径是自己先把磁带收掉，而收卷发生在 finally 里、fn 体拿不到句柄。不删：将来若磁带面被改成可重入（外部可提前收卷），它是第一道防线；届时本门禁会以 deadLeak 提醒它可能复活。 |
| `migration-loop` | engines/checkpoints.js | checkpoints.migrate 的自旋防护在 FORMAT=1 期**结构上不可达**：循环条件 f < FORMAT 要求 f<1，而唯一的迁移登记入口 registerMigration 收窄为 f<1 ⇒ missing-fields，0/-1/-2 全被拒。故循环体内永远拿不到 step，至多转 1 圈即走 no-migration 出口，guard 永不越 64。穷举验证（/tmp/diag7.js）：registerMigration(-2..0) 全返回 missing-fields；migrate({worldaxisCheckpoint:0}) 返回 no-migration。不删：将来若新增 format 2 与相应迁移，它是第一道防线（届时本门禁会以 deadLeak 提醒「该码可能复活」）。 |

## 基线（存量未分类）（233）

| 码 | 出现之处 | 说明 |
| --- | --- | --- |
| `absent` | core/settings-bus.js, core/store.js, engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `after-reply` | engines/bridge.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `all-rejected` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-` | engines/causal.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-abandoned` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-in-transit` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-json` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-locked` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-pending` | engines/fondness.js, engines/hazard.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-resolved` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-terminal` | engines/longline.js, engines/quota.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `already-there` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `api-fail` | engines/opinion.js, actors/observe.js, actors/profile.js, direction/oracle.js, ui/assistant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `applied` | engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/era-cycle.js, engines/ladder.js, engines/masks.js, engines/survival.js, engines/tempo.js, engines/warrant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `auto-off` | engines/backstage.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-amount` | engines/karma.js, engines/marginal.js, engines/org.js, engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-axis` | engines/survival.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-cap` | core/evict.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-channel` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-cost` | engines/difficulty.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-countdown` | engines/era-cycle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-due` | engines/longline.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-enum` | engines/difficulty.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-env` | engines/scene-slice.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-fallback` | engines/affect.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-form` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-gear` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-level` | engines/warrant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-load` | engines/affect.js, engines/survival.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-method` | engines/beast-bond.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-minutes` | engines/difficulty.js, engines/weather.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-name` | core/plugin.js, engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-order` | engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-outcome` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-patch` | engines/style.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-polarity` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-pool` | engines/quota.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-reliability` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-response` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-role` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-rows` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-rungs` | engines/ladder.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-span` | engines/tempo.js, engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-stakes` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-text` | engines/kaleidoscope.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-tier` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-trust` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-type` | engines/bonds.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-value` | engines/beast-bond.js, engines/fondness.js, engines/style.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-version` | core/rand.js, engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-volume` | core/rand.js, engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bad-who` | engines/spotlight.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `band-cap` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `bottom` | engines/ladder.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `burst` | engines/tolerance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `busy` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `capacity` | engines/chrono.js, engines/collab.js, engines/events.js, engines/parallel-events.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `chain-terminal` | engines/causal.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `checked` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `clean` | engines/warrant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `climate-throw` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `closed` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `commitment` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `commitment-fulfilled` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `conflicts-unresolved` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `contract-mismatch` | engines/lonsha-reader.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `corrupt-overflow` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `crisis` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `crowd` | engines/parallel-events.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `dedup` | engines/calendar.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `diag-idle` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `disabled` | engines/affect.js, engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/bridge.js, engines/calendar.js, engines/causal.js, engines/checkpoints.js, engines/chrono.js, engines/collab.js, engines/difficulty.js, engines/enigma.js, engines/era-cycle.js, engines/events.js, engines/fondness.js, engines/gauge.js, engines/hazard.js, engines/horizon.js, engines/karma.js, engines/ladder.js, engines/life.js, engines/marginal.js, engines/masks.js, engines/parallel-events.js, engines/parallel-world.js, engines/phone-bridge.js, engines/quota.js, engines/rivalry.js, engines/rumor.js, engines/scene-slice.js, engines/spotlight.js, engines/survival.js, engines/temperament.js, engines/tempo.js, engines/temporal-lock.js, engines/tolerance.js, engines/warrant.js, engines/wb-inject.js, engines/weather.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `dup-rung` | engines/ladder.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `dup-text` | engines/quota.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `emotion-word` | engines/affect.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty` | engines/chatcache.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-goal` | direction/oracle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-response` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-roster` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-round` | engines/spotlight.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-string` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `empty-text` | engines/canon.js, render/theater.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `engine-absent` | engines/hazard.js, engines/org.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `error` | engines/wb-inject.js, render/inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `evolve-key-mismatch` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `evolve-needs-single-key` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `exists` | engines/appearance.js, engines/beast-bond.js, engines/enigma.js, engines/era-cycle.js, engines/gauge.js, engines/hazard.js, engines/ladder.js, engines/marginal.js, engines/rumor.js, engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `export-throw` | core/rand.js, engines/org.js, ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `eye-face-clash` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `folded_too_small` | engines/inject-budget.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `frozen` | engines/tempo.js, engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `future-event` | engines/parallel-events.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `high-vigilance` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `identical` | engines/masks.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `insufficient-contrib` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `invalid-actors` | engines/rivalry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `judge-not-configured` | direction/oracle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `knowers-full` | engines/enigma.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `ledger-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `length-or-empty` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `locked` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `major-gate` | engines/warrant.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `manual` | engines/backstage.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `manual-mode` | engines/backstage.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-answer` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-cause` | engines/beast-bond.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-claim` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-coverage` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-delayed` | engines/causal.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-event` | engines/era-cycle.js, engines/gauge.js, engines/ladder.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-find` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-foreshadow` | engines/longline.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-key` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-question` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-reason` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-source` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-span` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-target` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-thread` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `missing-what` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `module-missing` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `negative-span` | engines/tempo.js, engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-basis` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-candidates` | engines/opinion.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-capacity` | engines/survival.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-change` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-channel` | engines/opinion.js, actors/profile.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-chat` | core/settle-guard.js, engines/backstage.js, engines/chatcache.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-companion` | engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-debt` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-host` | render/inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-id` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-input-el` | render/theater.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-merit` | engines/karma.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-name` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-pending` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-rules` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-shadow` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-snapshot` | render/inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-stale-subkeys` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-storage` | core/settings-bus.js, engines/checkpoints.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-th` | engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-time-word` | engines/calendar.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no-volume` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `no_sources` | engines/timeline.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `non-positive-delta` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `none` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-array` | core/evict.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-assigned` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-at-cap` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-enabled` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-found` | core/plugin.js, core/settings-bus.js, engines/chatcache.js, engines/parallel-world.js, render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-mounted` | engines/lonsha-reader.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-on-roster` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-open` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-pending` | engines/hazard.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-resolved` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `not-undoable` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `nothing-to-offset` | engines/karma.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `off-step` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `ok` | engines/lonsha-reader.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `orphan-recovery` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `outfit-clash` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `over-cap` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `over-pace` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `over_budget` | engines/inject-budget.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `overlap` | engines/affect.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `parse-fail` | render/purifier.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `payroll-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `pending-full` | engines/spotlight.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `pending_dropped` | engines/horizon.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `pinned_over_budget` | engines/inject-budget.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `pool-full` | engines/quota.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `prerequisite-open` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `probe-threw` | engines/lonsha-reader.js, engines/perf-trace.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `rand-unavailable` | engines/hazard.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `read-back-failed` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `read-failed` | core/settings-bus.js, core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `readback-failed` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `ready` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `reconcile-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `registry-missing` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `remove-threw` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `resource-missing` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `revivable` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `roster-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `rows-full` | engines/enigma.js, engines/hazard.js, engines/karma.js, engines/marginal.js, engines/tolerance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `same-day` | engines/era-cycle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `same-gear` | engines/tempo.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `same-layer` | engines/temperament.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `same-person` | engines/bonds.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `schedule` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `scheduled-elsewhere` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `self-pair` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `self-road` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `settle-throw` | ui/panel.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `shadow-closed` | engines/shadow.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `slots-exhausted` | actors/registry.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stage-off` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `staged-still-present` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stale` | engines/tolerance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stale-event` | engines/era-cycle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stale-proposal` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `step-too-large` | engines/gauge.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `store-` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `store-fail` | engines/parallel-world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `store-unavailable` | engines/affect.js, engines/appearance.js, engines/beast-bond.js, engines/bonds.js, engines/canon.js, engines/causal.js, engines/checkpoints.js, engines/chrono.js, engines/collab.js, engines/enigma.js, engines/era-cycle.js, engines/events.js, engines/fondness.js, engines/hazard.js, engines/intel.js, engines/karma.js, engines/ladder.js, engines/life.js, engines/longline.js, engines/marginal.js, engines/masks.js, engines/org.js, engines/parallel-events.js, engines/phone-bridge.js, engines/quota.js, engines/rumor.js, engines/shadow.js, engines/spotlight.js, engines/survival.js, engines/temperament.js, engines/tempo.js, engines/temporal-lock.js, engines/threads.js, engines/tolerance.js, engines/warrant.js, engines/weather.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `stringify-failed` | core/settings-bus.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `thread-terminal` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `throw` | engines/backstage.js, direction/oracle.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `thrown` | engines/lonsha-reader.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `too-long` | engines/canon.js, engines/chrono.js, engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `too-many-coverage` | engines/appearance.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `too-soon` | engines/hazard.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `top` | engines/gauge.js, engines/ladder.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `top-role` | engines/org.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `top-stage` | engines/fondness.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `trigger-fired` | engines/temperament.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `trusted-person` | engines/life.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unknown-basis` | engines/threads.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unknown-kind` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unknown-place` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unknown-site` | core/evict.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unlocked` | engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unparseable` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unreachable` | engines/intel.js, engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `unregistered-setting` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `verify` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `weather-blocked` | engines/world.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `within-lock` | engines/temporal-lock.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `write` | core/store.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `write-fail` | actors/registry.js, render/theater.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |
| `write-failed` | core/settings-bus.js, engines/checkpoints.js, engines/wb-inject.js | 存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档 |

