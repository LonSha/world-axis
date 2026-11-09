# WorldAxis 全域 383 核心引擎全景资产审计与协同架构大透视
> **编制日期**：2026-11-08 | **系统版本**：`v2.360.0` 基线
> **资产规模**：383 核心引擎 / 141,906 行高阶物理因果逻辑 / 520 套件 / 1218 死导出账本
> **核心主旨**：对全仓 383 个引擎实施全量普查、十域分类、接线透视与断点排查，建立通往 V21 纪元的全景导航图。

---

## 一、 全域 10 大子系统引擎分布矩阵

| 子系统域 ID | 子系统名称 | 引擎数量 | 总行数 | 注入源覆盖 | ActionDesk 纳管 | 级联总线协同 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **DOM_1_BIO** | 机能生理、病理创伤与微观代谢大系 | 13 | 4180 行 | 3 | 1 | 2 |
| **DOM_2_COMBAT** | 战术搏杀、潜行暗杀与军械掩体大系 | 12 | 3892 行 | 2 | 2 | 4 |
| **DOM_3_SPY** | 谍报暗网、审讯破绽与人际恩怨大系 | 12 | 3557 行 | 5 | 1 | 2 |
| **DOM_4_ECON** | 商路贸易、黑市高利与工坊产供大系 | 12 | 4930 行 | 3 | 7 | 0 |
| **DOM_5_SOC** | 社会门阀、官僚科层与地缘人口大系 | 19 | 7195 行 | 3 | 2 | 0 |
| **DOM_6_ENV** | 地理水文、极端灾变与声光微气象大系 | 14 | 3990 行 | 3 | 2 | 4 |
| **DOM_7_EPOCH** | 历史纪元、剧情暗流与因果命运大系 | 28 | 7628 行 | 9 | 5 | 0 |
| **DOM_8_COG** | 认知图景、意识形态与博弈契约大系 | 13 | 4066 行 | 5 | 0 | 0 |
| **DOM_9_DISPATCH** | 总线调度、行动看板与桥接跨插件大系 | 26 | 13381 行 | 5 | 6 | 5 |
| **DOM_10_INFRA** | 沙盒基石、性能管线与注入预算大系 | 234 | 89087 行 | 75 | 40 | 7 |

---

## 二、 十大子系统 383 引擎详尽透视图谱

### 机能生理、病理创伤与微观代谢大系 (DOM_1_BIO · 共 13 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `affect.js` | 208 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 2 | `affection-nexus.js` | 330 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 3 | `alchemy-toxicology.js` | 254 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 4 | `appearance.js` | 199 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 5 | `beast-bond.js` | 162 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 6 | `epidemic-contagion.js` | 403 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 7 | `human-realism.js` | 693 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 已挂载 |
| 8 | `metabolism-clock.js` | 289 | 无状态/计算 | 无注入需求 | 未直接纳管 | 已挂载 |
| 9 | `mood-glide.js` | 309 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 10 | `psyche-trauma.js` | 275 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 11 | `surgical-triage.js` | 375 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 12 | `toxic-metabolism.js` | 268 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 13 | `vitals.js` | 415 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |

### 战术搏杀、潜行暗杀与军械掩体大系 (DOM_2_COMBAT · 共 12 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `cataclysm-hazard.js` | 211 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 2 | `contest.js` | 649 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 3 | `cover-ballistics.js` | 172 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 4 | `environmental-hazard.js` | 371 | 无状态/计算 | 无注入需求 | 未直接纳管 | 已挂载 |
| 5 | `gear-wear.js` | 201 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 6 | `gear.js` | 391 | ACID 事务 | 无注入需求 | 已纳管 | 已挂载 |
| 7 | `hazard.js` | 421 | ACID 事务 | 已接线 (Yes) | 已纳管 | 已挂载 |
| 8 | `ruin-mechanism.js` | 191 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 9 | `spatial-conflict.js` | 341 | 无状态/计算 | 无注入需求 | 未直接纳管 | 已挂载 |
| 10 | `stealth-infiltration.js` | 295 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 11 | `tactical-combat.js` | 307 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 12 | `terrain-hazard.js` | 342 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |

### 谍报暗网、审讯破绽与人际恩怨大系 (DOM_3_SPY · 共 12 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `anti-omniscience.js` | 305 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 2 | `bonds.js` | 157 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 3 | `covert-espionage.js` | 554 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 4 | `enemies.js` | 179 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 5 | `fondness.js` | 456 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 6 | `interest-face.js` | 298 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 7 | `interop.js` | 229 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 8 | `interrogation-tell.js` | 273 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 9 | `rivalry.js` | 156 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 10 | `rumor-cognition.js` | 120 | ACID 事务 | 无注入需求 | 未直接纳管 | 已挂载 |
| 11 | `rumor.js` | 707 | ACID 事务 | 已接线 (Yes) | 已纳管 | 已挂载 |
| 12 | `whisper-backchannel.js` | 123 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |

### 商路贸易、黑市高利与工坊产供大系 (DOM_4_ECON · 共 12 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `blackmarket-usury.js` | 280 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 2 | `commission.js` | 479 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 3 | `contraband-pipeline.js` | 214 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 4 | `contraband.js` | 362 | ACID 事务 | 无注入需求 | 已纳管 | 被动调用 |
| 5 | `credit-ledger.js` | 292 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 6 | `economy.js` | 601 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 7 | `financial-contagion.js` | 184 | ACID 事务 | 悬空候选 (Pending) | 已纳管 | 被动调用 |
| 8 | `freight.js` | 461 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 9 | `production.js` | 822 | ACID 事务 | 无注入需求 | 已纳管 | 被动调用 |
| 10 | `recipe.js` | 686 | 无状态/计算 | 悬空候选 (Pending) | 已纳管 | 被动调用 |
| 11 | `supply-chain.js` | 429 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 12 | `supply-choke.js` | 120 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |

### 社会门阀、官僚科层与地缘人口大系 (DOM_5_SOC · 共 19 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `bureaucracy-ascension.js` | 168 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 2 | `care-chain.js` | 426 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 3 | `commons-governance.js` | 421 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 4 | `demographic-flow.js` | 534 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 5 | `editor-faction.js` | 176 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 6 | `faction-chronicle.js` | 190 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 7 | `faction-graph.js` | 413 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 8 | `faction-schism.js` | 123 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 9 | `family-ops.js` | 462 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 10 | `family.js` | 480 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 11 | `institutional-inertia.js` | 417 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 12 | `institutional-schism.js` | 113 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 13 | `knowledge-practice.js` | 364 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 14 | `org.js` | 1099 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 15 | `public-agenda.js` | 369 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 16 | `risk-pooling.js` | 327 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 17 | `role-conflict.js` | 313 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 18 | `sanctuary-scramble.js` | 183 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 19 | `social-legacy.js` | 617 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |

### 地理水文、极端灾变与声光微气象大系 (DOM_6_ENV · 共 14 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `atlas.js` | 327 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 2 | `ecosystem-predation.js` | 247 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 3 | `environment-interference.js` | 117 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 4 | `environmental-capacity.js` | 589 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 5 | `environmental-occlusion.js` | 193 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 已挂载 |
| 6 | `geo-tracker.js` | 420 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 7 | `maritime-navigation.js` | 332 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 8 | `microclimate-phase.js` | 186 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 9 | `region.js` | 416 | ACID 事务 | 已接线 (Yes) | 已纳管 | 已挂载 |
| 10 | `regional.js` | 199 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 11 | `spatial-acoustics.js` | 236 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 12 | `spatial-topology.js` | 286 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 已挂载 |
| 13 | `spatial-trace.js` | 236 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 14 | `weather.js` | 206 | ACID 事务 | 已接线 (Yes) | 已纳管 | 已挂载 |

### 历史纪元、剧情暗流与因果命运大系 (DOM_7_EPOCH · 共 28 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `butterfly-cascade.js` | 189 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 2 | `causal.js` | 1014 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 3 | `chrono.js` | 468 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 4 | `collateral-rupture.js` | 137 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 5 | `dramatic-tension.js` | 170 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 6 | `ephemeral-scrub.js` | 98 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 7 | `epoch-tide.js` | 167 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 8 | `epochal-transition.js` | 194 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 9 | `era-cycle.js` | 141 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 10 | `fate.js` | 511 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 11 | `foreshadow-germination.js` | 118 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 12 | `foreshadow-tree.js` | 361 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 13 | `foreshadow.js` | 274 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 14 | `motif.js` | 164 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 15 | `operations.js` | 598 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 16 | `story-choice.js` | 317 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 17 | `story-loop.js` | 464 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 18 | `story-tone.js` | 150 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 19 | `storyclock.js` | 125 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 20 | `storyline-advance.js` | 27 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 21 | `subtext-tension.js` | 236 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 22 | `temperament.js` | 96 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 23 | `tempo.js` | 117 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 24 | `temporal-lock.js` | 109 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 25 | `theme.js` | 509 | 无状态/计算 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 26 | `tolerance.js` | 216 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 27 | `undercurrent-calendar.js` | 465 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 28 | `veracity-arbitration.js` | 193 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |

### 认知图景、意识形态与博弈契约大系 (DOM_8_COG · 共 13 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `cognitive-poisoning.js` | 142 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 2 | `covenant-sanction.js` | 236 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 3 | `dilemma-bargain.js` | 122 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 4 | `epistemic-view.js` | 444 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 5 | `ideology-memetics.js` | 181 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 6 | `moral-dilemma.js` | 137 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 7 | `noesis.js` | 709 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 8 | `opinion.js` | 173 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 9 | `periodical-ideology.js` | 210 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 10 | `perspective-lock.js` | 500 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 11 | `redact-layer.js` | 196 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 12 | `ruling.js` | 758 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 13 | `shared-awareness.js` | 258 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |

### 总线调度、行动看板与桥接跨插件大系 (DOM_9_DISPATCH · 共 26 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `act.js` | 929 | ACID 事务 | 已接线 (Yes) | 已纳管 | 已挂载 |
| 2 | `action-cost-feedback.js` | 145 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 3 | `action-desk.js` | 3339 | ACID 事务 | 悬空候选 (Pending) | 已纳管 | 已挂载 |
| 4 | `action-methods.js` | 427 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 5 | `activity.js` | 1078 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 6 | `aftermath-impact.js` | 577 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 7 | `agency.js` | 625 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 8 | `agenda.js` | 358 | 只读/存取 | 悬空候选 (Pending) | 已纳管 | 被动调用 |
| 9 | `bridge.js` | 594 | 只读/存取 | 已接线 (Yes) | 已纳管 | 已挂载 |
| 10 | `cascade-bus.js` | 451 | 只读/存取 | 无注入需求 | 未直接纳管 | 已挂载 |
| 11 | `compact-timing.js` | 115 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 12 | `contract-audit.js` | 493 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 13 | `counterfactual-echo.js` | 113 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 14 | `counterfactual-sandbox.js` | 239 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 15 | `entry-router.js` | 270 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 16 | `intake-dispatch.js` | 228 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 17 | `intimate-arbiter.js` | 290 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 18 | `lonsha-reader.js` | 647 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 19 | `motive-arbitration.js` | 395 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 20 | `phone-bridge.js` | 275 | 无状态/计算 | 无注入需求 | 未直接纳管 | 已挂载 |
| 21 | `proactive.js` | 115 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 22 | `request-viewer.js` | 182 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 23 | `travel-desk.js` | 627 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 24 | `world-bridge.js` | 433 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 25 | `write-contract.js` | 299 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 26 | `write-desk.js` | 137 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |

### 沙盒基石、性能管线与注入预算大系 (DOM_10_INFRA · 共 234 个引擎)

| 序号 | 引擎文件 | 行数 | 存储事务 (Store/Transact) | 提示词注入源 | ActionDesk | 级联总线 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `aftermath.js` | 377 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 2 | `anomaly-mutation.js` | 177 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 3 | `archive-hide.js` | 101 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 4 | `auto-hide.js` | 163 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 5 | `autobiography-epiphany.js` | 154 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 6 | `backstage-tone.js` | 253 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 7 | `backstage.js` | 1120 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 8 | `beat-facade.js` | 290 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 9 | `beat-ledger.js` | 297 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 10 | `beat-mask.js` | 156 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 11 | `beat-report.js` | 278 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 12 | `beat.js` | 215 | 无状态/计算 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 13 | `binding.js` | 146 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 14 | `branch-diff.js` | 456 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 15 | `branch-transplant.js` | 112 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 16 | `branch-tree.js` | 309 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 17 | `calendar-custom.js` | 142 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 18 | `calendar.js` | 150 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 19 | `campaign.js` | 592 | ACID 事务 | 无注入需求 | 已纳管 | 被动调用 |
| 20 | `canon.js` | 739 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 21 | `capability-audit.js` | 189 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 22 | `capability-tier.js` | 635 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 23 | `capacity-audit.js` | 450 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 24 | `channel-probe.js` | 247 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 25 | `chapters.js` | 71 | ACID 事务 | 无注入需求 | 已纳管 | 被动调用 |
| 26 | `chatcache.js` | 410 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 27 | `checkpoints.js` | 748 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 28 | `choice-board.js` | 311 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 29 | `chronicle-view.js` | 277 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 30 | `city-folklore.js` | 209 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 31 | `civilization-relic.js` | 198 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 32 | `collab.js` | 671 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 33 | `community-note.js` | 170 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 34 | `compare.js` | 277 | 无状态/计算 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 35 | `conspiracy-weaver.js` | 221 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 36 | `coop.js` | 913 | ACID 事务 | 无注入需求 | 已纳管 | 被动调用 |
| 37 | `coordinate.js` | 276 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 38 | `courier-dispatch.js` | 145 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 39 | `crowd-panic.js` | 156 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 40 | `custom-lax.js` | 1153 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 41 | `day-route.js` | 543 | ACID 事务 | 无注入需求 | 未直接纳管 | 已挂载 |
| 42 | `deep-clean.js` | 226 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 43 | `defer-token.js` | 198 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 44 | `dep-check.js` | 512 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 45 | `difficulty.js` | 102 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 46 | `digest.js` | 189 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 47 | `diplomacy.js` | 620 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 48 | `direct-event.js` | 121 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 49 | `disaster-evacuation.js` | 355 | 无状态/计算 | 无注入需求 | 未直接纳管 | 已挂载 |
| 50 | `dream-settle.js` | 111 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 51 | `dream.js` | 294 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 52 | `driver-ledger.js` | 903 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 53 | `eccentric-threads.js` | 332 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 54 | `eco-audit.js` | 440 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 55 | `editor-events.js` | 178 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 56 | `elsewhere.js` | 368 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 57 | `enigma.js` | 154 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 58 | `ensemble.js` | 307 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 59 | `entities.js` | 236 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 60 | `events.js` | 769 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 61 | `evidence-board.js` | 508 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 62 | `evolution.js` | 452 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 63 | `farfield.js` | 596 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 64 | `field-writers.js` | 152 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 65 | `first-run.js` | 312 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 66 | `floor-changes.js` | 248 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 67 | `floor-settle.js` | 386 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 68 | `floor-snapshot.js` | 233 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 69 | `followup-gate.js` | 142 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 70 | `gauge.js` | 168 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 71 | `gen-gate.js` | 373 | 只读/存取 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 72 | `gen-timing.js` | 344 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 73 | `group-refuse.js` | 108 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 74 | `handoff-pack.js` | 366 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 75 | `health-preflight.js` | 1085 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 76 | `history-search.js` | 562 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 77 | `horizon.js` | 408 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 78 | `host-wb-trace.js` | 266 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 79 | `identity-match.js` | 132 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 80 | `idiosyncrasy.js` | 239 | ACID 事务 | 无注入需求 | 已纳管 | 被动调用 |
| 81 | `inject-budget.js` | 1192 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 82 | `inject-channel.js` | 116 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 83 | `inject-collector.js` | 403 | 只读/存取 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 84 | `inject-inspector.js` | 257 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 85 | `inject-slot-audit.js` | 215 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 86 | `inject-value.js` | 404 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 87 | `inline-tags.js` | 393 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 88 | `inspector-state.js` | 534 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 89 | `inst.js` | 487 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 90 | `intel.js` | 448 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 91 | `intent-board.js` | 228 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 92 | `investigation.js` | 571 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 93 | `judicial-inquest.js` | 195 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 94 | `kaleidoscope.js` | 537 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 95 | `karma.js` | 203 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 96 | `l3-registry.js` | 149 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 97 | `labor-schedule.js` | 668 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 98 | `ladder.js` | 170 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 99 | `ledger-timeline.js` | 230 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 100 | `ledger.js` | 125 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 101 | `legacy-oath.js` | 240 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 102 | `length-policy.js` | 157 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 103 | `lens-culling.js` | 153 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 104 | `liaison.js` | 740 | 无状态/计算 | 无注入需求 | 已纳管 | 被动调用 |
| 105 | `life.js` | 587 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 106 | `lifeline.js` | 305 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 107 | `limits.js` | 151 | 只读/存取 | 无注入需求 | 已纳管 | 被动调用 |
| 108 | `lingqi.js` | 208 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 109 | `living-world.js` | 1330 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 110 | `longline.js` | 100 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 111 | `marginal.js` | 224 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 112 | `masks.js` | 95 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 113 | `memory-sampler.js` | 193 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 114 | `memory-tiers.js` | 212 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 115 | `memory.js` | 252 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 116 | `mend.js` | 290 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 117 | `modelink.js` | 210 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 118 | `narrative-deduction.js` | 224 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 119 | `narrative-dice.js` | 164 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 120 | `narrative-lens.js` | 202 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 121 | `observation-projection.js` | 132 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 122 | `observe-slice.js` | 177 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 123 | `offline-return.js` | 551 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 124 | `offline-tick.js` | 476 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 125 | `offstage-life.js` | 369 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 126 | `one-shot-mod.js` | 217 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 127 | `opportunity.js` | 565 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 128 | `outline-inject.js` | 527 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 129 | `output-guard.js` | 206 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 130 | `parallel-events.js` | 102 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 131 | `parallel-world.js` | 408 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 132 | `path-echo.js` | 261 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 133 | `pending-center.js` | 631 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 134 | `perception-manipulation.js` | 180 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 135 | `perf-baseline.js` | 385 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 136 | `perf-ledger.js` | 199 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 137 | `perf-trace.js` | 986 | 只读/存取 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 138 | `periodicals.js` | 83 | ACID 事务 | 无注入需求 | 已纳管 | 被动调用 |
| 139 | `persona-anchor.js` | 314 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 140 | `personal-inventory.js` | 264 | 无状态/计算 | 无注入需求 | 未直接纳管 | 已挂载 |
| 141 | `phase-transition.js` | 621 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 142 | `plan-audit.js` | 279 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 143 | `plan.js` | 729 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 144 | `playable-blueprint.js` | 769 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 145 | `playable-seed.js` | 358 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 146 | `player-archive.js` | 106 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 147 | `playtime.js` | 258 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 148 | `plot-gauge.js` | 357 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 149 | `pmem.js` | 309 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 150 | `polish.js` | 123 | 无状态/计算 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 151 | `populate.js` | 638 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 152 | `portal.js` | 157 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 153 | `power-anchor.js` | 174 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 154 | `prefilter-gate.js` | 203 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 155 | `preset-world.js` | 209 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 156 | `preset.js` | 215 | 只读/存取 | 无注入需求 | 已纳管 | 被动调用 |
| 157 | `probe.js` | 439 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 158 | `purify-scope.js` | 160 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 159 | `push-api-registry.js` | 107 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 160 | `pyro-telecom.js` | 198 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 161 | `quota.js` | 176 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 162 | `reasoning-strip.js` | 148 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 163 | `reasoning.js` | 173 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 164 | `refine.js` | 143 | 无状态/计算 | 无注入需求 | 已纳管 | 被动调用 |
| 165 | `rehearsal.js` | 558 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 166 | `rehearse.js` | 141 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 167 | `reject-recovery.js` | 943 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 168 | `relation-graph.js` | 416 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 169 | `relation-temp.js` | 382 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 170 | `reply-guard.js` | 168 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 171 | `research-closure.js` | 201 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 172 | `research.js` | 493 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 173 | `retrieval.js` | 699 | 只读/存取 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 174 | `rewriter.js` | 99 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 175 | `rhythm-loop.js` | 148 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 176 | `round-cost.js` | 282 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 177 | `round-drivers.js` | 144 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 178 | `routine-pacing.js` | 482 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 179 | `rule-pack.js` | 1253 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 180 | `rules.js` | 208 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 181 | `sampler-check.js` | 160 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 182 | `save-health.js` | 347 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 183 | `scene-budget.js` | 134 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 184 | `scene-narrative.js` | 671 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 185 | `scene-slice.js` | 127 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 186 | `scope-tag.js` | 152 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 187 | `sediment.js` | 355 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 188 | `service-network.js` | 605 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 189 | `session.js` | 435 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 190 | `shadow.js` | 448 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 191 | `siege-attrition.js` | 210 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 192 | `social-encounter.js` | 244 | 无状态/计算 | 无注入需求 | 未直接纳管 | 已挂载 |
| 193 | `solo-voice.js` | 178 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 194 | `spotlight.js` | 230 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 195 | `stage-presence.js` | 447 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 196 | `stage.js` | 281 | ACID 事务 | 已接线 (Yes) | 已纳管 | 已挂载 |
| 197 | `stale-guard.js` | 162 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 198 | `stall.js` | 551 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 199 | `storage-forecast.js` | 159 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 200 | `style.js` | 254 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 201 | `success-grade.js` | 182 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 202 | `summarizer.js` | 240 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 203 | `survey.js` | 730 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 204 | `survival.js` | 150 | ACID 事务 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 205 | `tape-store.js` | 162 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 206 | `tech-lineage.js` | 577 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 207 | `threads.js` | 293 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 208 | `timeline.js` | 183 | 只读/存取 | 已接线 (Yes) | 已纳管 | 被动调用 |
| 209 | `tool-analyzer.js` | 220 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 210 | `tool-diag.js` | 7999 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 211 | `tool-import.js` | 228 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 212 | `tool-snapshot.js` | 187 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 213 | `training.js` | 336 | ACID 事务 | 无注入需求 | 已纳管 | 被动调用 |
| 214 | `transit-scheduler.js` | 228 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 215 | `universal-routine.js` | 305 | 无状态/计算 | 无注入需求 | 未直接纳管 | 已挂载 |
| 216 | `userlock.js` | 147 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 217 | `warrant.js` | 126 | ACID 事务 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 218 | `wb-inject.js` | 212 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 219 | `wb-search.js` | 157 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 220 | `weighted-draw.js` | 142 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 221 | `word-budget.js` | 114 | 无状态/计算 | 无注入需求 | 未直接纳管 | 被动调用 |
| 222 | `world-autobiography.js` | 410 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 223 | `world-blueprint.js` | 917 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 224 | `world-briefing.js` | 244 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 225 | `world-changes.js` | 43 | 只读/存取 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 226 | `world-clock.js` | 232 | 无状态/计算 | 已接线 (Yes) | 未直接纳管 | 被动调用 |
| 227 | `world-diary.js` | 304 | ACID 事务 | 悬空候选 (Pending) | 未直接纳管 | 被动调用 |
| 228 | `world-graph.js` | 442 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 229 | `world-health.js` | 387 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |
| 230 | `world-lab.js` | 1294 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 231 | `world-seed.js` | 879 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 232 | `world-snapshot.js` | 901 | ACID 事务 | 无注入需求 | 未直接纳管 | 被动调用 |
| 233 | `world.js` | 1351 | 无状态/计算 | 已接线 (Yes) | 已纳管 | 已挂载 |
| 234 | `worldbook.js` | 362 | 只读/存取 | 无注入需求 | 未直接纳管 | 被动调用 |

