# V29 计划台账（自动生成，勿手改）

> 由 `node tools/plan-ledger.js --write` 从 `git log` 生成。手改会被
> `node tools/plan-ledger.js --check` 点名（重算与盘上不一致 ⇒ 退出 1）。

- 生成源：subject 提到 `OPV29-` 的提交 **9** 条 · 源摘要 `77f989f15661`
- 已交付 **15 / 36**，未交付 **21**
- 欠账读数：区间号 1 · 无复算读数 0 · 形态不认识 0 · 重复声称 0

## Z1（已交付 0 / 6）

_无_

## Z2（已交付 0 / 6）

_无_

## Z3（已交付 2 / 6）

| 项 | 提交 | 标题 | 复算读数 |
| :--- | :--- | :--- | :--- |
| OPV29-16 | `30af0ae` | feat(worldaxis): OPV29-16 红门禁最小复现 —— 18 项，面数 598→599 | 4 条：`node tests/opv29-z3-16-v2529.js ⇒ pass (18)` |
| OPV29-18 | `52bb590` | feat(worldaxis): OPV29-28 计划台账自动汇总 + OPV29-18 台账与现场一致 —— 68 项 | 6 条：`node tests/opv29-z5-28-v2529.js ⇒ pass (41)` |

## Z4（已交付 4 / 6）

| 项 | 提交 | 标题 | 复算读数 |
| :--- | :--- | :--- | :--- |
| OPV29-19 | `695725d` | feat(worldaxis): OPV29-21/23 空转检测与抖测试治理 + OPV29-19/20 锚定收窄与负控制覆盖 —— 45 项 | 8 条：`node tests/opv29-z4-v2529.js ⇒ pass (25)` |
| OPV29-20 | `695725d` | feat(worldaxis): OPV29-21/23 空转检测与抖测试治理 + OPV29-19/20 锚定收窄与负控制覆盖 —— 45 项 | 8 条：`node tests/opv29-z4-v2529.js ⇒ pass (25)` |
| OPV29-21 | `695725d` | feat(worldaxis): OPV29-21/23 空转检测与抖测试治理 + OPV29-19/20 锚定收窄与负控制覆盖 —— 45 项 | 8 条：`node tests/opv29-z4-v2529.js ⇒ pass (25)` |
| OPV29-23 | `695725d` | feat(worldaxis): OPV29-21/23 空转检测与抖测试治理 + OPV29-19/20 锚定收窄与负控制覆盖 —— 45 项 | 8 条：`node tests/opv29-z4-v2529.js ⇒ pass (25)` |

## Z5（已交付 5 / 6）

| 项 | 提交 | 标题 | 复算读数 |
| :--- | :--- | :--- | :--- |
| OPV29-25 | `e1daaa5` | feat(worldaxis): OPV29-25 新引擎脚手架 —— 七处接线一次检查一次写入，少一处就不写盘 | 4 条：`node tools/new-engine.js --check --name=x --ns=x  ⇒ OK（7 处锚点齐、唯一命中）` |
| OPV29-26 | `ea9542b` | feat(worldaxis): OPV29-26 登记一致性校验 + OPV29-33 密钥扫描扩面 —— 68 项 | 5 条：`node tests/opv29-z5-26-v2529.js ⇒ pass (40)` |
| OPV29-27 | `3480ad5` | feat(worldaxis): OPV29-27 版本面跟位 + OPV29-35 发布清单化 —— 23 项，面数 596→598 | 8 条：`node tests/opv29-z5-27-v2529.js ⇒ pass (23)` |
| OPV29-28 | `52bb590` | feat(worldaxis): OPV29-28 计划台账自动汇总 + OPV29-18 台账与现场一致 —— 68 项 | 6 条：`node tests/opv29-z5-28-v2529.js ⇒ pass (41)` |
| OPV29-29 | `0e3f0f4` | feat(worldaxis): OPV29-29 依赖零新增守门 —— 扫 1308 个 JS，外部包 0，白名单走既有登记表 | 5 条：`node tools/dep-audit.js                 ⇒ 依赖合规: 0 个外部包` |

## Z6（已交付 4 / 6）

| 项 | 提交 | 标题 | 复算读数 |
| :--- | :--- | :--- | :--- |
| OPV29-31 | `b62742f` | feat(worldaxis): OPV29-31/32 收口 —— 存储自愈补上「文件在但空」这一盲区，锁自愈补齐五态与幂等 | 3 条：`node tests/opv29-z6-v2529.js                     ⇒ pass（51 项）` |
| OPV29-32 | `b62742f` | feat(worldaxis): OPV29-31/32 收口 —— 存储自愈补上「文件在但空」这一盲区，锁自愈补齐五态与幂等 | 3 条：`node tests/opv29-z6-v2529.js                     ⇒ pass（51 项）` |
| OPV29-33 | `ea9542b` | feat(worldaxis): OPV29-26 登记一致性校验 + OPV29-33 密钥扫描扩面 —— 68 项 | 5 条：`node tests/opv29-z5-26-v2529.js ⇒ pass (40)` |
| OPV29-35 | `3480ad5` | feat(worldaxis): OPV29-27 版本面跟位 + OPV29-35 发布清单化 —— 23 项，面数 596→598 | 8 条：`node tests/opv29-z5-27-v2529.js ⇒ pass (23)` |

## 未交付（21）

OPV29-01 · OPV29-02 · OPV29-03 · OPV29-04 · OPV29-05 · OPV29-06 · OPV29-07 · OPV29-08 · OPV29-09 · OPV29-10 · OPV29-11 · OPV29-12 · OPV29-13 · OPV29-14 · OPV29-15 · OPV29-17 · OPV29-22 · OPV29-24 · OPV29-30 · OPV29-34 · OPV29-36

## 区间号（不展开，只点名）

- `07fd549` 的 subject 里写了 `OPV29-01～36` —— 那是计划纲领/汇总语境，不算逐项交付
