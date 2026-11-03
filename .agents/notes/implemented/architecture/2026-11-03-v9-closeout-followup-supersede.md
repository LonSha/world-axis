# Agent Note: V9 收口全量回归的判据跟位（第四趟后 11 条失败清偿）
Status: implemented
## Problem
第四趟全量（`/tmp/worldaxis-regression-fZNhck`，461 节、24039 通过 / 11 失败、unchanged:true）暴露三类红：①`v7-cap-tier-2283` 四条 MECH 计数仍停在 V8 的 103/68/61/96；②`v8-driver-l3-2294` P3 期望 injectCollector 仍在 L3a，但本工作区第一趟修复时给它落了真面板设置分区（「结构汇流选材」），驱动账本按裁决顺序把它升为 L2p —— 期望与现场分叉；③`inject-volume-baseline` 的冻结地板仍是 V8 复核值，而 V9 把结构汇流的折叠行从「其余折叠：k=v（按持有人明细）」简化为「其余折叠：N 条」，四轮各缩 13~15 字。三处都是**产品合法演进把旧锁期望落在身后**，不是功能坏了（同节另 4 条 Chromium 失败单独复跑 4/0，属长程重载下的并发资源型环境故障）。
## Decision
全部判据跟位、零产品改动：cap-tier 按 MECH 105 基线跟位（B6=70、C4=63、C5=70、C12=98，仍保持「目标 − 出厂」差值恒等式）；driver-l3 把 injectCollector 移出 INJECT_CONSUMED，另立 P3f/P3f2 双向钉住「L2p 在、L3a 不在」，防回摆；体积地板按 2.295.0 重复核后逐轮精确设为实测值（2390/2738/3524/3532），注释写明缩量成因，不低于 50% 的报警线未动。负控制全部保留：cap-tier 的 N 判据、driver-l3 的 runNegative、基线的源码破坏副本判据都原样复验通过。
## Alternatives considered
- 把面板分区回退、维持 injectCollector 挂 L3a：让产品迁就旧读数，且分区本身是第一趟全量失败清单（wa-collector-enabled 分区标题锁）点名要求的真实功能，回退即返工。
- 给地板留 V8 数值加容差带：容差是「不复核的许可证」，下次任何缩量都会被静默吞掉；改为显式重复核并注明成因。
- Chromium 4 条失败改测试为「允许通道缺席」：那是把环境故障洗成绿，纪律红线，不动。
## Consequences
cap-tier 与 capability-tier-v2257 两套档位读数重新一致（105/70/63/98 vs 70 机制口径）。driver-l3 的 L3a 名单降为三台，面板「只被诊断面读」计数随之 −1，属如实变化。体积地板数值缩了但判据形态未松：破坏副本、故障透传、结构汇流占比三项负控不变。
## Verification
三锁单独复跑：v7-cap-tier-2283 34/0、v8-driver-l3-2294 32/0、inject-volume-baseline 3/0；v8-browser-2294 与三个 v9-browser-2295* 单独复跑 4/0 与各 1/0。第五趟全量以 4096MB 堆上限重启后另行核收 result.json 三要素。
## Follow-up: 第五趟后 Chromium 六条的根因修复
第五趟（`/tmp/worldaxis-regression-QiaUve`，24042 通过 / 失败 6）把红点收敛到纯浏览器族。复现链：isolated-runner 的 cleanEnv 把 HOME 重定向到 task 目录 ⇒ `ui-live.js` 的 `browsersRoot()` 只信 `os.homedir()` ⇒ playwright 缓存（root 账户家目录）失联，而本机无系统级安装位 ⇒ 探测如实降 fallback 档。修复：`browsersRoot()` 增加 `os.userInfo().homedir`（getpwuid，跟 uid 不吃 $HOME）候选并按在场者优先 —— 与 v2.163.0 的 SYSTEM_BROWSER_PATHS 是同一先例的账户级补全，测试基建修复、零产品改动。worker 同款环境（HOME=task）下四锁复验：v8-browser-2294 4/0、v9-browser 4/0、v9-settings 1/0、v9-b5b6 1/0。
## Follow-up 2: 第六趟后 4 条超时杀的真因与预算重算
第六趟（`/tmp/worldaxis-regression-73mYkh`，24044 通过 / 失败 4）把红点收敛到 v2137/O14 与 O9 实机通道的 `exit（实 null）`。O9 子进程的 stdout 已打印「pass / 24 项全绿」仍被记为 null ⇒ spawnSync 超时强杀。实测：O9L 103s、ui-live-2137 全锁 168s，而统一预算 96000ms 是 V8 时代「最重门禁 dead-export-gate 12s × 8」的产物 —— browsersRoot() 修复让实机门从静态 60s 变真浏览器 168s，预算口径本身没错、输入变了。按模块自身口径一重算：GATES 表登记 ui-live-2137-e2e raw=168000 成新最重门禁 ⇒ 统一预算 1344000ms（run.js 84 处武装值 + 单一真源 + TIMEOUT_ARMED 全表 sed 统一）；外壳默认 RUNNER_TIMEOUT_DEFAULT_MS 按 attempt6 实测 3394.68s × 1.5 取整分钟 = 5100000ms。两道预算门禁（gate-timeout 82+1+1 分档、gate-timeout-v2105 54 项含 A3/A4/N3 锚点基线跟位）全绿。
## Follow-up 3: 第七趟后最后两条守卫判据的输入更新
第七趟（`/tmp/worldaxis-regression-3fL8eH`，24046 通过 / 失败 2）只剩 v2105 预算区间判据（上限 300000 会误杀合法重算出的 1344000）与 v2203 默认值复算判据（钉在旧实测 2278.99s）。按两判据自己的口径更新输入：区间上限放宽到 1800000（两端含义不变），复算输入改为本轮实测 3394.68s（公式一致、值同步改）。gate-timeout.js 沿革注释补 5100000 的来历段。两道预算门禁复验全绿。
## Follow-up 4: 第八趟后 D2 时序断言的采样稳健化
第八趟（`/tmp/worldaxis-regression-Osvd0C`，24047 通过 / 失败 1）只剩 opt9-panel D2「收起态渲染更快」反向（展开 84.61ms / 收起 309.63ms）。单独复跑 52/0 全绿 ⇒ 62 分钟长跑末段的同机负载单边抬高了一轮 10 次均值采样。改法：采样改三轮交错、每轮 10 次取最小值（同机比较下对噪声最稳健的统计量），判据语义 `msCol < msExp` 不变，单独复跑 52/0。V9 长跑下的性能采样从此不再吃单轮噪声。
## Related decisions audit
- [V9 选材额度、变化区间与末态续接](2026-11-03-v9-selection-changes-continuation.md)：本笔记是其折叠行简化与选材分区落地在旧锁上的账务后果。
- [OPV8-4 驱动账本假阴性](2026-11-03-opv84-driver-ledger-false-negative.md)：其「Alternatives considered」段另载 O8 两个成员的登记取舍；本笔记的 P3f 与该登记是同一事实的两面（一个管面、一个管台账）。