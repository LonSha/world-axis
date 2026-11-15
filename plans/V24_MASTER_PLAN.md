# WorldAxis V24 全景双九项纲领（EXV24-1～9 + OPV24-1～9）

> **基线起点**：`v2.415.0` / commit `eb94a6a` / 421 引擎 / 555 调用期引用。
> **立项纪律**：每条缺口均有可复算命令与现场读数；指不出证据的条目不进计划。
> **实施纪律**：双计划全部完成前严禁全量回归；每项带专属专锁（真源码破坏负控制）；写口统一收拢 ActionDesk；新持久键按 evict 站点容量规矩登记。
> **目标版本**：`v2.416.0` 单版本批次收口（沿用"一个版本做完全部小更新"口径）。

---

## 零、立项依据与现行真红审计（现场实测，2026-11-15）

| 编号 | 缺口（现场实测事实） | 复算路径 | 归属 |
| :--- | :--- | :--- | :--- |
| R1 | `tests/run.js:22830` 钉版字面量停在 `'2.410.0'`，现场已 2.415.0 —— 全量回归纪律期间漂红 5 个版本无人发现（全量未跑盲区活标本） | `grep -n "__wantPin293 = '2\.410.0'" tests/run.js` | OPV24-1 |
| R2 | `index.js:1475` 的 `BUILD_ID` 停在 v2.411.0 提交 `d5eee61a`，此后 4 个版本未跟 —— 违反"升版时 BUILD_ID 与 VERSION 同批推进，不允许只改其一"的自身纪律 | `git log -S 'd5eee61a' -- index.js` | OPV24-2 |
| R3 | `export-contract` 漂移 1：现场 34044 字符 vs 冻结 34009（`ns=429 members=2814`） | `node tools/ledger-audit.js` → FAIL export-contract | OPV24-3 |
| R4 | `sync-hardcoded` stale：散装读数漂移（dry-run 已给出逐行修法） | `node tools/sync-hardcoded.js` | OPV24-4 |
| R5 | `NEXT_PLAN.md:3` 仍称 V12 "尚未实施"，而 V23 双九项 18/18 已交付 —— 文档断言反事实 | `head -3 NEXT_PLAN.md` 对照 `git log` | OPV24-5 |
| R6 | `tools/version-consistency.js`（OPV26 新门禁）未被 `tools/smart-runner.js` L0 名单消费 —— 新门禁有调度死面风险 | `grep version-consistency tools/smart-runner.js` 零命中 | OPV24-6 |
| R7 | `version-consistency` 校验面不含 BUILD_ID 与 run.js 钉版字面量（R1/R2 因此漏网） | 阅读该工具校验清单 | OPV24-7 |
| R8 | 探针 `p_world_pulse.js`（22 断言）活在仓库外 `/home/user/probes/`，克隆者不可复跑 | `find . -name 'p_world_pulse.js'` 零命中 | OPV24-9 |

**拓展线候选的概念真空**（全仓 421 引擎语料零命中，复算：全引擎关键字扫描）：
忌日/周年/纪念日 · 外乡人/排外/融入 · 租佃/佃农/田租 · 征兵/兵役/军饷 · 乳母/育儿 · 失物/拾遗/招领 · 朝圣/香客 · 赌坊/骰局 · 裁缝浆洗/澡堂沐浴。
**已排除的撞车项**：媒人说亲（与 `betrothal-alliance.proposeMatch` 结盟联姻面重叠，宁缺毋滥）；疫病/婚丧/学徒/当铺/调解/讨债等 30 余个候选均已有引擎覆盖。

---

## 一、拓展创新线（EXV24-1 ～ EXV24-9）

| 编号 | 机制名称 | 落盘模块 | 机制核心与验收边界 |
| :--- | :--- | :--- | :--- |
| **EXV24-1** | 忌日周年与祭仪 | `engines/anniversary-rites.js` | 忌日/周年/纪念日账本，到日触发悼念/纪念注面；过期不自动消账（祭不由机器代行）。写口：anniversaryRites.register / observe |
| **EXV24-2** | 外乡人融入与排外 | `engines/outsider-integration.js` | 外乡人登记、排外度、受雇/受拒见证积累、融入分档（生客→面熟→自家人）。写口：outsiderIntegration.arrive / recordWitness |
| **EXV24-3** | 租佃与田租 | `engines/tenancy-rent.js` | 佃约签订、按季收租、欠租累计、逼佃与荒田回流。写口：tenancyRent.lease / collectRent / evictTenant |
| **EXV24-4** | 兵役军饷与哗变 | `engines/military-levy.js` | 兵籍登记、募兵/征发、军饷拖欠累计、哗变风险档。写口：militaryLevy.register / levy / payStipend |
| **EXV24-5** | 乳母雇佣与育儿 | `engines/nursing-care.js` | 乳母雇佣、哺育分派、育儿人力缺口、断奶回执。写口：nursingCare.hire / assignNursing / wean |
| **EXV24-6** | 失物招领 | `engines/lost-and-found.js` | 失物登记、拾获上交/私吞两途、招领与认领凭据（认领须说得出物证）。写口：lostFound.reportLoss / logFound / claim |
| **EXV24-7** | 朝圣香客与香火 | `engines/pilgrim-flow.js` | 香客往来账、还愿登记、庙宇香火档与市集增益。写口：pilgrimFlow.arrive / registerVow / fulfilVow |
| **EXV24-8** | 赌坊骰局与赌债 | `engines/dice-den.js` | 赌局开局/押注/开骰（走决策流随机源）、赌债入账、出千败露。写口：diceDen.openTable / placeBet / settle |
| **EXV24-9** | 浴堂浆洗与衣冠 | `engines/bathhouse-laundry.js` | 澡堂沐浴、浆洗浆补、衣物洁净档对社交印象的注面。写口：bathhouseLaundry.openBath / washGarments |

## 二、优化提升线（OPV24-1 ～ OPV24-9）

| 编号 | 治理对象 | 治法与验收边界 |
| :--- | :--- | :--- |
| **OPV24-1** | run.js 钉版字面量漂移（R1） | `__wantPin293` 跟位至本版；纳入 version-consistency 校验面，此后漏跟当场红 |
| **OPV24-2** | BUILD_ID 四个版本未跟（R2） | 收口提交后按 R243 二次提交惯例回填；纳入 version-consistency 校验面 |
| **OPV24-3** | export-contract 漂移 35 字符（R3） | 先归因（属追加还是丢失），再按 --write 回填，ledger-audit 恢复全绿 |
| **OPV24-4** | sync-hardcoded stale（R4） | 按 dry-run 输出真写回填，散装读数与真源重新一致 |
| **OPV24-5** | NEXT_PLAN 反事实（R5） | 本计划落盘 `plans/V24_MASTER_PLAN.md`；NEXT_PLAN.md 入口重写为 V24 现状 |
| **OPV24-6** | smart-runner L0 死面风险（R6） | version-consistency 纳入 L0 门禁层名单，调度器真消费 |
| **OPV24-7** | version-consistency 校验面收拢（R7） | 新增 BUILD_ID 与 run.js 钉版两条校验；配专属负控制专锁（真源码破坏自证） |
| **OPV24-8** | 九引擎接线四件套 | index.js 装载 / tests/run.js LOAD 面 / tool-diag MODULE_EXPORTS / action-desk 路由 + export-contract、module-registry、dead-export 登记面批量跟位 + 概览页一个聚合读数块 |
| **OPV24-9** | 探针收编（R8） | `p_world_pulse.js` 迁入 `tests/probes/`，克隆者可复跑；原路径留转发说明 |

## 三、贯通场景专锁（场景 68）

`tests/scenario-v68-v24-civil-life.js` —— 民生日志跨引擎链：租佃欠租→逼佃流离（联动 sediment/offstage-life）→ 外乡人入村受雇 → 失物拾获认领 → 忌日祭仪 → 香客还愿 → 赌坊赌债 → 浴堂浆洗（社交印象注面）。全链只读注面一块聚合。

## 四、实施铁律（沿用，无新增）

1. 先专锁、再实现、真负控制必备；2. 写口统一 ActionDesk（沿共享拒收码，不新造码面）；3. 新持久键在 evict 登记站点容量；4. 零依赖零新增；5. 每个引擎自带 `stat()/view()` 只读读口 + `buildBlock()` 注面；6. 版本锚点升版时由 version-consistency 门禁护航。
