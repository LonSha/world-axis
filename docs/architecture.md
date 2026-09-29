# 架构

零依赖 Node 库 + SillyTavern 第三方扩展。无 `package.json`、无 `node_modules`（只用 Node 内置模块）。

## 分层与文件分布

| 目录 | 文件数 | 职责 |
|---|---|---|
| `core/` | 19 | 地基：时钟 / 随机源 / 存储 / 设置总线 / 输入边界 / 故障上下文 / 权限 / 沙箱 / 插件 / 挤出 / 撤销 / 执行上下文 |
| `engines/` | 104 | 世界机制（推演、因果、情报、关系、组织、经济、天气、面板采集 …） |
| `render/` | 3 | 注入管线（分源装配 → 净化 → 剧场） |
| `ui/` | 3 | 面板 / 设置页 / 助手（无头环境不装载，需浏览器复核） |
| `direction/` | 3 | 导演侧（选项、预言、标签） |
| `actors/` | 4 | 角色侧（档案、观察、独白、注册表） |
| `compat/` | 3 | 宿主适配（MVU / TH-helper / host 探测） |
| `tests/` | 139 | 回归、专锁、门禁、账本 |
| `tools/` | 12 | 生成器与门禁辅助（只留被可执行代码引用的） |

产品文件面（不含 `tests/`、`tools/`）实测 **140 个 .js**，由 `tests/product-files.js` 单一定义 ——
它是「产品文件」这件事的**单一真源**，其它门禁一律向它取值，不得自带第二份清单。

## 装载次序

`index.js` 的 `LOAD_ORDER` 是**显式数组**（实测 139 条，`core/clock.js` → `ui/assistant.js`），
不用 glob、不靠文件名排序。数组里每条都带注释写明**为什么排在这里**、以及「排在前面会不会抛」。

次序约束分两类，混在一起看会误判：

- **装载期约束**（真的会炸）：模块尾部调 `WA.registerModule` 登记自己，而 `registerModule` 由 `core/store.js` 提供 ⇒ `core/sandbox.js` / `core/plugin.js` 排在 `store` 之前会抛 `order-violation`。
- **调用期约束**（只影响可读性）：模块在**调用期**才读 `WA.xxx`，装载期不读 ⇒ 对次序无硬要求，排在一起是为了阅读顺。

`engines/tool-diag.js` 的 `MODULE_EXPORTS` 是**模块注册面**的第二真源（实测 139 条，与 `LOAD_ORDER` 一一对应）：
磁盘上有 `*.js` 而这里没登记，就成了一块「自检看不见的黑盒」，由清册的「未登记模块」一项抓。

## 单一真源清单（改代码前先看这里）

| 事实 | 真源 | 谁向它取值 |
|---|---|---|
| 产品文件有哪些 | `tests/product-files.js` | 全部门禁 |
| 导出面（跨文件依赖的成员） | `tests/export-contract.js` 生成的冻结串 | `tests/run.js` 双向绑定 |
| 死子面账本 | `tests/dead-export-ledger.json` | `tests/dead-export-gate.js` |
| 拒收码归属 | `tests/reject-code-ledger.json` | `tests/reject-code-gate.js` |
| 世界状态一级键 | `tests/field-liveness-ledger.json` | `tests/field-liveness-gate.js` |
| 模块注册面 | `engines/tool-diag.js` 的 `MODULE_EXPORTS` | 清册、自检 |
| 装载次序 | `index.js` 的 `LOAD_ORDER` | 装载期断言 |
| 拒收码手册 | `docs/ERROR_CODES.md`（生成物） | `tools/gen-error-codes.js --check` |
| 版本条目（做了什么/为什么，v2.80.0+） | `ITERATION_LOG.md` | 人 |
| 版本条目存放形态（哪一段在哪个文件） | `tests/docs-archive-gate.js` | `tests/run.js` 的第九道门禁 |
| 版本条目存档（v2.20.0 及更早，92 条） | `ITERATION_LOG.md` 的「版本条目存档」节 | 只读；`docs-archive-gate` 判它不许与 README 重复 |

## 注入链（一句话版）

`render/inject.js` 是注入的单一装配点：按 `SOURCES` 分源取内容 → 经 `render/purifier.js` 净化 →
交给宿主。**每个源都要在 `SOURCES` 登记**，否则「加了消费点忘了登记源」在生产上表现为静默不注入，
由 v2.56.0 的双向成类锁抓（见 [gates.md](gates.md)）。

**容量三处同源**（少一处就是静默的自我不一致）：`core/evict.js` 的 `SITES`（挤出侧）· `core/store.js` 的 cap 表（容量侧）·
`core/store.js` 的 `defaultWorldState()` 骨架（物化侧）。
登记了容量却不在骨架里物化 ⇒ 冷启动直写会炸事务，且只在 `maintain` / `registryParity` 这类路径上现形。
