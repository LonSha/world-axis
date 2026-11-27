# V30 拓展/优化双计划（18 项 · 2026-11-27 现场）

> 口径：门禁是默认项，不是项目本身。每项必须有**入口面 / 故事面读点 / 闭环**之一；
> 只有判据、没有产品的交付不算完成。本文件是 18 项状态的单一真源；
> `tests/v30-dual-plan-v2615.js` 逐条钉住这里的状态词与复算命令。

## 现场基线（可复算）

- `find engines -maxdepth 1 -type f | wc -l` → 561
- `find tests -maxdepth 1 -name "*.js" | wc -l` → 706
- `find tools -maxdepth 1 -name "*.js" | wc -l` → 103
- `git log -1 --format=%h` → 0d5bb4e
- `manifest.json` version → 2.614.0

## 拓展计划（9 项）

| # | 项 | 状态 | 完成标志 / 复算 |
|---|---|---|---|
| 1 | 外貌词表进注入面 | already-done | v2.588.0 已接：`render/inject.js` 的 `appearanceLexicon` 分支 + `tests/appearance-lexicon-inject-v2588.js` |
| 2 | entry 类入口面框架 | planned | 35 条 entry 需业务对象入参；本轮未造第二条写路径，保持 R10 裁决：先做入口设计，再逐条接入 |
| 3 | P1 模型身份指纹探针 | planned | 设计稿在 `docs/MODEL_IDENTITY_PROBE.md`；与 R289 能力指纹互补，本轮未新增产品探针，脚本桩不算交付 |
| 4 | 人物日程闭环 | planned | 候选/日程底座已在 routine-pacing/day-route；确认回执→位移→结算→后果全链未闭合，需 owner 写入面 |
| 5 | 赔偿/信任/原谅三轴 | planned | `human-realism.settleGrudge` 当前仍以非空 resolution 直接 settled；需拆分证据、信任与原谅，不能只加注释 |
| 6 | 五台孤儿引擎合法读点 | adjudicated | `docs/ORPHAN_ENGINES_ADJUDICATION.md` 已逐台裁决；找到合法读点才改判接入 |
| 7 | 时间/日历/地图三账合一 | planned | TLX 已有时间轴对账；地图页与人物位置/下一站/证据源仍未统一到同一读面 |
| 8 | 世界体检页产品化 | planned | 读数分散在 tool-diag / 连接页 / round-cost；本轮未改 UI，避免未经验证的面板读数冒充产品化 |
| 9 | 真宿主验证 | evidence-gap | `v10-ui-pills` / `v10-r3-persist-hosted` 仍需真 SillyTavern @8000 证据；headless 不能替代 |

## 优化计划（9 项）

| # | 项 | 状态 | 完成标志 / 复算 |
|---|---|---|---|
| 10 | 跟位税工具化 | done | `tools/new-engine.js --mode=version-bump\|data-only --check\|--dry-run` 输出只读跟位清单；原 7 路引擎模式 48/48 不变 |
| 11 | 回归分片落地 | already-done | `tools/shard-runner.js --run` 与 `tools/shard-locks.js --run` 已在位；全量仍为最终验收入口 |
| 12 | 巨型文件拆分 | adjudicated | 本轮不拆：外 API 与 706 把锁的锚点面牵连太深，收益低于风险；裁决为「只在有独立可回退窗口时拆」，复算 `wc -l` 与 `node tests/run.js` 后改判 |
| 13 | 红项分层裁决 | planned | 已知 dice-/ask/faces/ui-binding 在 HEAD 上就红；需逐条裁决真实缺口/判据过期/登记过期并落文档 |
| 14 | 两向自证写进新锁模板 | already-done | `tools/gen-lock.js` 生成 A/B/C/N 骨架，N 段 TODO(人工) 拒绝冒充通过 |
| 15 | 状态所有权与事务写入 | partial | `human-realism` 六写口已 transactional，`getRoot` 仍裸返回内部对象；其余模块未逐台审完 |
| 16 | 账本毕业机制 | planned | dead/dataOnly/零读账本仍在增长；需与 ns-consumer 的真读点逐条对账后销行 |
| 17 | 请求与预算归因 | partial | apiRouter / call-timeline / round-cost / 探针读数已有；缺统一玩家视图与请求→功能归因表 |
| 18 | 文档裁决现场化 | done | 本文件每项带状态词与复算口径；`docs/gates.md` 明确「读数现场跑」 |

## 状态词定义

- `done`：本轮有可复算交付物。
- `already-done`：开工前现场确认已落地，不重造轮子。
- `partial`：底座在位，但仍有明确未完成闭环。
- `adjudicated`：已裁决「现在不接」并写明改判触发器，不是欠债。
- `planned`：需求清楚但产品闭环尚未实现。
- `evidence-gap`：代码/判据无法替代真宿主证据。
