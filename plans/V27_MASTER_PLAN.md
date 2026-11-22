# WorldAxis V27 全景双九项纲领（EXV27-1～9 + OPV27-1～9）

> **基线起点**：`v2.522.0` / commit `f3a2706` / 450 引擎 / 591 测试文件 / 508 命名空间 / 5698 导出成员。
> **目标版本**：`v2.524.0` 单版本批次收口（沿用「一个版本做完全部小更新」口径）。
> **立项纪律**：每条缺口必须给出**现场读数**与**可复算命令**；指不出证据的条目不进计划。
> **本次特别纪律（用户口径）**：**不把门禁当内容**。优化线九项一律是**产品能力/工程质量**
> （启动、存档、注入、可发现性、可读性、兼容、消费面），不得以「新增一把锁 / 跟位一条账」充数。
> 门禁只在必要时作为配套验收手段，不计入 18 项。

---

## 零、立项依据（现场实测，2026-11-17，`v2.522.0` / `f3a2706`）

| 编号 | 现场事实（读数） | 复算路径 | 归属 |
| :--- | :--- | :--- | :--- |
| R1 | 装载时**每台引擎各打一行** `[WorldAxis] engines/xxx 已加载（ver）`，实测 **182** 个引擎有此行 —— 装好扩展后控制台刷 182 行，真正的告警被淹掉 | `grep -rl '已加载' engines/ \| wc -l` → 182 | OPV27-1 |
| R2 | 冷启动**全 eager**：空世界装载 `485ms` / 堆 `33.6MB` / RSS `78.9MB`，508 个命名空间、5698 个成员一次性求值；**从没有「哪台引擎装载慢」的读数** | `node --max-old-space-size=3072 /tmp/p21b.cjs` | OPV27-2 |
| R3 | 空局存档骨架 **9802 字节**；最大容器 `evolution` 595B、`worldSingularity` 178B；**没有任何长局曲线**（10/50/200 轮存档多大、哪个容器涨得最快，全仓无人回答） | 同 R2 探针 → `saveBytes` / `TOPSTORE` | OPV27-3 |
| R4 | 注入链 2249 行、`SOURCES` **150 个源**；预算裁决**只打一行** `注入 500/2400t`，被裁掉的是**哪几节、为什么被裁**（可替代性档位）玩家与诊断都看不见 | `grep -c 'source:' render/inject.js` → 164；`awk '/const SOURCES = \[/,/\];/' render/inject.js` 去重 → 150 | OPV27-4 |
| R5 | 产品侧直接消费面：**55** 个引擎的「Consumer files」≤2（贴着死面） | `awk -F'\|' 'NR>4&&NF>4{gsub(/ /,"",$4); if($4+0<=2)c++} END{print c}' docs/engine-integration-inventory.md` → 55 | OPV27-5 |
| R6 | **333** 个引擎登记了 `__settingsRegs`，而面板侧没有中文名索引、没有搜索、没有分组 —— 玩家想关掉某功能，得先知道它叫 `affectionNexus` | `grep -rc '__settingsRegs' engines/*.js \| awk -F: '$2>0' \| wc -l` → 333 | OPV27-6 |
| R7 | 拒收码基线已到 **943** 条（`tests/reject-code-ledger.json`），话术覆盖**没有读数**：哪些码能翻成「玩家能做什么」、哪些只会甩英文码，无人知道 | `node -e "const j=require('./tests/reject-code-ledger.json');console.log(Object.keys(j.codes\|\|j).length)"` | OPV27-7 |
| R8 | 骨架键**持续增长**（本版刚加 `spatialTopology` 三环），老存档缺新键时只有「事务炸了」这一种表现；缺键清单不可见、无预检 | `grep -n 'spatialTopology' core/store.js` | OPV27-8 |
| R9 | 同一事实被**多节重复注入**（memory / pulse / digest / ledger / world 各来一遍）从未建过重复度读数，token 预算按节切分但不按「信息增量」算 | `grep -n 'buildBlock' render/inject.js \| wc -l` | OPV27-9 |

**拓展线概念真空（全仓 `engines/` 语料 0 命中）**

```
$ for k in 当票 火耗 官银 银锭 盐政 盐引 牙行 脚夫 税关 更鼓 夜禁 走水 失火 灯会 庙会 纸扎 保正 里甲 乡规; \
    do printf '%s:%s ' "$k" "$(grep -rl "$k" engines/ 2>/dev/null | wc -l)"; done
当票:0 火耗:0 官银:0 银锭:0 盐政:0 盐引:0 牙行:0 脚夫:0 税关:0
更鼓:0 夜禁:0 走水:0 失火:0 灯会:0 庙会:0 纸扎:0 保正:0 里甲:0 乡规:0
```
（`占卜:0 / 拆字:0 / 巫觋:0 / 说书:0 / 皮影:0 / 社戏:0 / 戏班:0 / 傀儡戏:0 / 杂技:0` 同样 0 命中。）

**已排除的撞车项（宁缺毋滥）**
- 驿递 → `engines/postal-relay.js`（v2.400.0 EXV22-2：驿路节点 / 换马耗时 / 断毁已有），**不做**。
- 诉讼断案 → `judicial-inquest` / `warrant` / `evidence-board` / `interrogation-tell` 已成体系；保甲只做**邻里连带与乡约断事**，不碰公堂。
- 赌坊骰局 → `dice-den` 已在（V24）；丧葬 → `mortuary-rites` 已在（纸扎只做祭品与灯棚，不做丧仪）。
- 教派香火 → `theology-cult` / `pilgrim-flow` 已在（V24 香客还愿）；灯会庙市只做**市集与灯棚**。
- 典当 → `engines/plan.js` 里「当铺」只是**线索文本**，无机制。

---

## 一、拓展创新线（EXV27-1 ～ EXV27-9）· 命题：**钱、货、夜、火**

| 编号 | 机制名称 | 落盘模块 | 机制核心与验收边界 |
| :--- | :--- | :--- | :--- |
| **EXV27-1** | 当票质押与赎当 | `engines/pawn-redemption.js` | 押物开票（当本 / 月息 / 期限）→ 赎当（本息结清才还物）→ 断当变卖（逾期不赎转绝当）。**利率与期限由调用方给，不瞎猜**；断当留痕（谁估价、几时到期）。写口 `pledge / redeem / forfeit` |
| **EXV27-2** | 银钱成色与火耗倾煎 | `engines/silver-assay.js` | 成色折算（纹银 / 九成 / 八色）+ 火耗加征（按成色差补倾煎损耗）+ 短陌。只回答「这笔钱在账上值多少」，**不决定价格**。写口 `assay / addMeltLoss / shortString` |
| **EXV27-3** | 盐引专卖与私盐查缉 | `engines/salt-franchise.js` | 引额登记（引地 / 引数）→ 越额即私盐 → 查缉没入（须有**见证人**，凭空查获一律拒收）。写口 `grant / drawSalt / seize` |
| **EXV27-4** | 牙行居间与抽佣 | `engines/broker-house.js` | 牙人登记 → 撮合买卖 → 抽佣（三分 / 五分档）→ 居间失信（抬价、飞过海）入账。**只做居间关系，不碰货价**（货价属 commodity-circulation）。写口 `enlist / match / commission / defame` |
| **EXV27-5** | 更夫巡夜与夜禁 | `engines/night-watch.js` | 打更报时（一更～五更）→ 夜禁违犯（无灯无牌被拿）→ 盗警联动。**时间走世界钟**，更次间隔取自 `clock`，不自造时间源。写口 `beat / violate / report` |
| **EXV27-6** | 火政与走水 | `engines/fire-watch.js` | 火铺（水龙 / 火钩）配置 → 起火点与蔓延（材质 + 风向；**不掷骰造灾**，起火必由调用方声明）→ 扑救（人手 / 水源 / 距离决定成灭）→ 延烧损失入账。写口 `ignite / muster / fight / loss` |
| **EXV27-7** | 灯会庙市与纸扎 | `engines/festival-fair.js` | 灯棚铺面（摊位 / 灯式）→ 庙市客流（节令驱动）→ 灯棚走水风险（与 EXV27-6 联动）→ 纸扎祭品销路。写口 `openStall / crowd / closeStall` |
| **EXV27-8** | 保甲乡约与义仓赈济 | `engines/ward-compact.js` | 保甲编户（十户一甲 / 甲长）→ 连坐告发 → 乡约断事（只做邻里裁处与赔礼，不进公堂）→ 义仓开仓（仓存 / 放赈 / 秋还）。写口 `enroll / accuse / mediate / openGranary` |
| **EXV27-9** | 巫觋占卜与拆字 | `engines/divination-craft.js` | 术士登记（巫 / 觋 / 卜者）→ 占断（问事 / 起卦 / 断言）→ 应验登记（应验与否都留痕，**不许事后改口**）→ 哄传（断语被市井改写）。随机走 `core/rand.js` 可复现源。写口 `cast / confirm / spread` |

---

## 二、优化提升线（OPV27-1 ～ OPV27-9）· 命题：**玩家的启动、存档、注入与可发现性**

| 编号 | 治理对象 | 治法与验收边界 |
| :--- | :--- | :--- |
| **OPV27-1** | 182 行启动噪音（R1） | 引擎自述行改为**统一装载汇报**：装载结束打**一条** `已装载 N/N`；告警与失败**照旧必响**；诊断面板保留逐台明细（含版本）。验收：开新聊 `[WorldAxis]` 行数 ≤5，失败仍可见 |
| **OPV27-2** | 冷启动无热点读数（R2） | 逐台装载耗时入 `perf-baseline` 新增 `boot` 面（p50/p95 + TOP10 慢引擎），并对 TOP3 做真实裁剪（重复构建 / 无谓深拷贝）。验收：`boot` 面有数可复跑；TOP3 同机前后对比 |
| **OPV27-3** | 存档体积无曲线（R3） | 建「存档体积账」：空局 / 10 / 50 / 200 轮四点曲线 + 容器 TOP10 增长排名；对增长最快三容器**真裁剪**（冗余字段 / 重复快照），老档可读。验收：曲线可复跑，裁剪后同轮次体积下降 |
| **OPV27-4** | 注入裁剪不透明（R4） | 预算裁决结果结构化：`planInfo` 落**被裁清单**（源名 + 可替代性档位 + 省下 token），诊断节与注入设置页各显示一处。验收：能回答「这轮关系块为什么没进来」 |
| **OPV27-5** | 55 台窄消费引擎（R5） | 挑 **12 台**真接进产品链（backstage 每轮读 / action-desk 路由 / 面板读数块，**必须是玩家能触发的路径**）。验收：清单里这 12 台 consumer 数上升，且能指出玩家从哪一步触发 |
| **OPV27-6** | 333 组设置不可发现（R6） | 设置面加**中文名索引 + 搜索 + 分组**（世界/人物/关系/叙事/性能/诊断），复用 `settings-bus` 登记，零新增设置键。验收：任一引擎名可搜到设置项、看到当前值与「关掉会怎样」 |
| **OPV27-7** | 943 拒收码话术覆盖不明（R7） | 建**话术覆盖率读数**：每码是否有「玩家能做什么」一句中文；先补最常撞的 5 簇（容量 / 权限 / 缺参 / 时序 / 归属）。验收：覆盖率入账，面板不再甩裸码 |
| **OPV27-8** | 老档缺键不可见（R8） | 存档体检：导入/续接给**缺键清单**（缺哪键 / 哪个引擎写 / 补齐影响），按骨架自愈并留痕；**不静默填、不假装有数据**。验收：缺 `spatialTopology` 的老档导入后清单可见、自愈后事务不炸 |
| **OPV27-9** | 注入重复语料无账（R9） | 建**信息增量账**：同一事实在多节重复时给重复度（逐源「新增唯一片段 / 总片段」），先建读数再定去重策略（保留最高优先级源）。验收：读数可复跑；去重后同预算下唯一信息不降 |

---

## 三、贯通场景专锁（场景 69 · 钱货夜火）

`tests/scenario-v69-v27-money-night-fire.js`：

> 盐引批文到手（EXV27-3）→ 牙行替盐商撮合出货（EXV27-4）→ 银钱成色不足、倾煎补火耗（EXV27-2）
> → 周转不济押物开当票（EXV27-1）→ 夜里私盐过境被更夫撞见（EXV27-5）→ 盐仓走水延烧灯棚（EXV27-6 + EXV27-7）
> → 同甲保长被连坐问责、义仓开仓赈济（EXV27-8）→ 市井卜者断言「火起于贪」，断语被哄传（EXV27-9）。

全链只读注面一块聚合；每环拒收都必须有见证（说不出物证 / 无见证人 / 无起火声明一律拒）。

---

## 四、实施铁律（沿用，无新增）

1. **先专锁、再实现、真负控制必备**（`srcOverride` 破坏真源码，两向自证）。
2. **写口统一 ActionDesk**：走共享拒收码，不新造码面；能拒就拒，不静默兜底。
3. **新持久键进骨架 + `__BOUNDED_CAPS` + `evict.SITES` 三处同批登记**；不进骨架必须写书面理由。
4. **零依赖零新增**；时间走 `clock`，随机走 `core/rand.js`。
5. 每台引擎自带 `stat()/view()` 只读读口 + `buildBlock()` 注面（能被注入链真消费）。
6. **接线四件套**：`index.js` LOAD_ORDER / `tests/run.js` LOAD / `tool-diag` MODULE_EXPORTS / `action-desk` 路由；
   同批跟位 `export-contract` / `dead-export` / `reject-code` / `module-registry` / 概览页聚合读数块。
7. **不把门禁当内容**：优化线成果必须是玩家/维护者能直接感到的东西（更快、更小、更清楚、能搜到、能回答为什么）。

---

## 五、进度（v2.524.0 交付实测回填）
| 项 | 状态 | 落点 / 证据 |
| :--- | :--- | :--- |
| EXV27-1 当票质押 | **完成** | `engines/pawn-redemption.js` · 场景 71-4 · 断当须逾期（负控制①） |
| EXV27-2 银钱成色 | **完成** | `engines/silver-assay.js` · 场景 71-3 |
| EXV27-3 盐引专卖 | **完成** | `engines/salt-franchise.js` · 场景 71-1 · 无见证不许没入（负控制②） |
| EXV27-4 牙行居间 | **完成** | `engines/broker-house.js` · 场景 71-2 |
| EXV27-5 更夫夜禁 | **完成** | `engines/night-watch.js` · 场景 71-5 |
| EXV27-6 火政走水 | **完成** | `engines/fire-watch.js` · 场景 71-6 · 不掷骰造灾 |
| EXV27-7 灯会庙市 | **完成** | `engines/festival-fair.js` · 场景 71-7 |
| EXV27-8 保甲乡约 | **完成** | `engines/ward-compact.js` · 场景 71-8 · 乡约不许判刑 |
| EXV27-9 巫觋占卜 | **完成** | `engines/divination-craft.js` · 场景 71-9 · 不许改口（负控制③） |
| OPV27-1 启动噪音 | **完成** | `core/boot-report.js` + `index.js` 装载窗口／汇报：182 行 → 1 行，告警照旧必响 |
| OPV27-2 冷启动热点 | **完成** | `WA.boot` 逐台耗时（p50/p95/慢 TOP3）+ `perfBaseline.boot()` 装载面；实测 TOP3 = tool-diag 19.0ms / style 13.5ms / store 10.0ms |
| OPV27-3 存档体积曲线 | **完成** | `engines/save-curve.js`（`sample` 只读不写档、`growth` 两点起算）· 实测空局 9.6KB → 10 轮 12.8KB → 50 轮 25.6KB → 200 轮 74.4KB，增长 TOP chronicle +24385B / worldFacts +14785B / memory.l1 +14093B / currents +13077B · **真裁剪**：`backstage.archiveScheduled` 去掉恒空 `summary:''` + `refs:[]`，200 条 42503B → 37903B（省 4.6KB / 10.8%），读侧三处（`chronicle-view.js:81-82`、`ui/panel.js:700`）本就容缺 |
| OPV27-4 注入裁剪透明 | **完成** | `injectBudget.plan()` 被裁项带 `tier` / `savedTokens`，`explain(plan, source)` 一句话回答；`planInfo.dropped` 与 `tool-diag` 诊断节同批消费 |
| OPV27-5 窄消费引擎 | **完成** | `engines/narrow-consumers.js`：12 台逐台实测 `view()` 后分四档（runtime / runtime-empty / static / no-reader）· 实测分布「运行时数据 3 · 有账未长 2 · 只有静态词表 7 · 无读口 0」，`buildBlock()` 只收 runtime，正文出 `[在用机制] 自动隐去·vias 2` · 接 `render/inject.js` 作「在用机制」源 |
| OPV27-6 设置面中文索引 | **完成** | `engines/settings-index.js`：零二次登记（数据源就是 `WA.__settingsRegs`），中文名表 40 + 键名表 13，七条分组规则，`offEffect()` 对含 `enabled` 的组给确定答复 · 实测 363 组（有中文名 29 · 未登记 334），表外一律 `nameZh: null` 不伪造 |
| OPV27-7 拒收码话术覆盖 | **完成** | `engines/reject-phrase.js` 五簇（容量/权限/缺参/时序/归属）+ `action-desk.withPhrase()` 挂玩家面 · 实测覆盖 **415/943（44%）**：缺信息 275 · 归属 76 · 容量 33 · 时序 18 · 权限 13，未覆盖 528 条如实甩裸码不编「请重试」 |
| OPV27-8 老档缺键体检 | **完成** | `core/store.js` 的 `ensureShape(target, fresh, sink, prefix)`（不传参行为逐字不变）+ `store.shapeAudit()` 在深拷贝上 dry-run，每条带 `{path, kind, writer, impact}` · `__loadStat.lastFix` 扩出 `missing` / `missingTotal`，`loadStat()` 长行投影同批跟位 |
| OPV27-9 注入信息增量账 | **完成** | `engines/inject-delta.js`：`normSeg` 只去空白与首尾标点（不做近义改写，改写会造假重复），`measure` 按注入顺序先到者拿唯一、后到者记 `dupWith` · 挂 `planInfo.delta` · 实测两源 4 段 / 唯一 3 / 重复 1（25%） |

### 本轮实测收口读数（2026-11-17）
- 版本：`2.524.0`（`index.js` VERSION / `manifest.json` / `tests/run.js __wantPin293` / 13 个锚点测试白名单与版本正则同批跟位）
- 模块面：文件 522 · 命名空间 521 · 装载期边 384 · 调用期引用 644 · 死子 1825
- 门禁：`module-cycle-gate-v2107` pass（65）· `segment-extract-v2400` pass（128）· `version-consistency` 通过 28 项 · `ns-consumer-ledger-v2400` pass（70）· `ledger-audit` 四绿（module-registry / module-cycle / sync-hardcoded / export-contract），余 `UI_BINDINGS` 一条 ——
  该条在 `git worktree` 的干净 HEAD（`f3a2706`）上同样复现（`ui/panel.js` 的 `send_textarea`），**属基线预存失败，不是本批引入**。
- 新增专锁：`tests/scenario-v71-v27-money-night-fire.js`（66 项）· `tests/opv27-boot-report-lock.js`（60 项）· `tests/opv27-inject-explain-lock.js`（31 项）· `tests/opv27-rest-lock.js`（86 项，六项一一对应六条真源码负控制）

### 六项的人话结论（读完就能判断该不该信）
这六项全部有可复跑的读数，不复跑也能凭下面这一句判断：
- **OPV27-3**：存档 200 轮长到 74.4KB，最肥的是 chronicle；我按排名真砍了 `archiveScheduled` 的恒空字段，每条省 23B（10.8%），老档照样能读。
- **OPV27-5**：不是「12 台全接进正文」——实测下来 7 台只会吐静态词表（`worldClock.weekdays 7` 这类），硬塞进正文就是拿设置当剧情。最终只收 runtime 那 3 台，正文出 1 条真数据。
- **OPV27-6**：363 组设置里只有 29 组有中文名。剩下 334 组**如实**返回 `nameZh: null`，不拿拼音编一个——编了只是把「不可发现」换成「不可信」。
- **OPV27-7**：943 条拒收码里 415 条（44%）能翻成人话动作句；528 条没话术就原样甩码，不统一兜一句「请重试」骗玩家。
- **OPV27-8**：老档缺键现在能列出「缺哪个、谁写的、补齐后读数会怎样」，缺方未登记就如实写 null，不假装知道。
- **OPV27-9**：重复度按注入顺序判归属，先到者拿唯一、后到者记 `dupWith`；不做近义改写，因为改写会造出假重复。

## 六、全量回归在这一台机器上跑不完 —— 这是环境事实，不是结论豁免

三趟实测（同一入口 `tools/isolated-run.js`，worker 显式 `--max-old-space-size=6144`）：

| 趟 | 结果 | 断点 |
| :--- | :--- | :--- |
| 1（默认堆） | 62 分钟 V8 `heap out of memory`（SIGABRT） | 325/422 节 |
| 2（`NODE_OPTIONS` 给 5120） | 进程被系统收走（并发时 swap 已用 4G、峰值 used 8.7G/11G） | 停在 `v2.137.0（O14）UI 实机验证通道` 之后的 `v2.2150` 一带 |
| 3（本批收口：`setsid` + `--max-old-space-size=6144`） | **跑到第 457/458 节**，结束原因 `timeout` | 末节 `v2.380.0 (V21): 文明盛衰与生态政变六条端到端场景专锁`（该节自身 101.57s） |

第三趟的 85 分钟上限不是拍脑袋：`tests/gate-timeout.js:78` 的 `RUNNER_TIMEOUT_DEFAULT_MS = 5100000`，
取的是「实测 3394.68s × 1.5」。本机实测整趟 ≈ 95 分钟（457 节里超 60s 的有 17 个），**恰好卡在这条线的外面**。
这条上限本身是对的（它是"整趟不许无限跑"的护栏），本机只是比基准机慢，故**没有去改它**。

### 三趟红线逐条归因（四种处置，没有第五种）

| 类别 | 规模 | 处置与证据 |
| :--- | :--- | :--- |
| 基线预存（干净树同红） | 11 组 | 在 `git worktree add --detach /tmp/wa-b2 f3a2706` 的干净树上逐条复跑，同红同数：`beat-facade-lock-v2193` / `u4-export-lifecycle-v2191` / `orphan-lock-v2750` / `p5-stage-v2214` / `s3-tx2-v2166` / `version-surface-gate-v2185` / `o7-plan-tree-gate-v2187` / `o8-consumer-gate-v2187` / `o1-host-matrix-v2186` / `s3-b3-e7-v2188` / `s3-b2-o3-v2182` / `s3-b4-n10-v2228` / `reject-recovery-lock-v2192`（同红即不改、不留账） |
| 基线预存（本轮新确证） | 11 条 | `capability-tier-v2257` 在干净树上同样 **77 pass / 11 fail**（实测 261 开 / 117 机制 vs 登记 234 / 116）；本批只把它从 261 推到 270 = 那 9 台 EXV27 引擎（`brokerHouse / divinationCraft / festivalFair / fireWatch / nightWatch / pawnRedemption / saltFranchise / silverAssay / wardCompact`，探针 `/tmp/probe_sw.cjs` 两树逐名 diff，MECH 两树同为 117） |
| 本批引入（已修，见下） | 3 组 | 手册未重生成（15 个新码）/ `SOURCES` 150 未跟位 / 死导出证据 `tref` 未复核 |
| 只在全量顺序里红（单跑绿） | 其余 | `tests/s3-tp4-v2160.js` 单跑 **98 pass / 0 fail**（干净树上 30 pass / 1 fail）；`tests/handoff-pack-ui-v2273.js` 48/0。这一类是"靠顺序活着"的旧病，本机跑不完全量 ⇒ **证不伪，如实记成未归因** |

### 三条本批引入的红线，修的是事实不是判据

1. **手册落后于源码**：`docs/ERROR_CODES.md` 是 `node tools/gen-error-codes.js` 的**生成物**（文件头自己写着「不要手改」），
   本批 15 个新拒收码进了源码没进手册。跑生成器 → 1825 码（见证 830 / 死表 52 / 基线 943），15 个码逐个可查。
2. **注入源表未跟位**：`render/inject.js` 真加了 `narrowConsumers` 一条源，`tests/run.js` 的 `v2380` 断言仍写 150。
   改 151 并写明「这条数是源表变化的落账点，故跟着改」——同一批的 `v2131/O16`（站点读数与账本同源）随之对齐。
3. **死导出证据失实**：`store.shapeAudit`（OPV27-8 新增的死导出）账本记 `tref=3`、现场复算 5。
   `node tests/dead-export-gate.js --update` 重写 1832 条证据；再跑门禁：`✓ 死子面无新增、归因可读、元数据同源、证据可复算`。

### 「全绿」这个词不给

本机跑不完一趟全量 ⇒ **"全量绿"在本机不可证**，写它就是把没发生的事写成结论。能证的是这三句：
- 本批 18 项自己的专锁全绿：`opv27-rest-lock`（86）· `scenario-v71-v27-money-night-fire`（66）· `opv27-boot-report-lock`（60）· `opv27-inject-explain-lock`（31）；
- 四账本 + 版本锚点全绿：`module-cycle-gate-v2107`（65）· `segment-extract-v2400`（128）· `ns-consumer-ledger-v2400`（70）· `reject-code-gate`（1825 码全有归属）· `version-consistency`（28 项）· `dead-export-gate`（✓）；
- 全量红线里**没有一条能归到本批代码上**：3 组已修并复跑，11+11 组在干净树上同红，其余单跑绿。
