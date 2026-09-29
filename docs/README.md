# docs/

本目录只放**机器测不出来、或测得到但不该埋在 README 里**的东西。

| 文件 | 是什么 | 谁生成 |
|---|---|---|
| [ERROR_CODES.md](ERROR_CODES.md) | 拒收码手册（601 个内联码的归属与见证） | `node tools/gen-error-codes.js`（生成物，`--check` 双向校验） |
| [architecture.md](architecture.md) | 分层、装载次序、单一真源清单 | 手写 |
| [gates.md](gates.md) | 八道门禁逐条：它治什么病、怎么跑、怎么读读数 | 手写 |
| [contributing.md](contributing.md) | 改代码的规矩（零依赖、不动冻结面、文档同步） | 手写 |

## 文档与真源的分工

这个仓库只承认一种事实来源：**能被命令复算出来的读数**。文档负责指路，不负责断言。

- 版本之间「做了什么 / 为什么 / 影响范围 / 门禁结果」→ [`../ITERATION_LOG.md`](../ITERATION_LOG.md)（**单一真源**）
- 每个版本的**当前**读数 → 现场跑门禁，见 [gates.md](gates.md)；不要引用文档里抄来的数字
- 收口时的固定读数表 → `ITERATION_LOG.md` 顶部基线表
- 四版本执行清单（历史跟踪，非当前状态）→ [`../FOUR_VERSION_PLAN.md`](../FOUR_VERSION_PLAN.md)

**不写「与源码重复的说明」**：模块清单、导出面、容量表、拒收码全部由源码与生成器决定，
文档里再抄一份就多一份会漂的副本（本仓 v2.108.0 的教训：同一个 ui 三文件清单全仓四份副本）。
